import test from "node:test";
import assert from "node:assert/strict";

import {
  reconcileV3SquareLinkHistoryReadOnly
} from "../utils/reconcileV3SquareLinkHistoryReadOnly.js";

const orderId = "abcdef123456abcdef123456";

const makeHistoryReader = links => ({
  async collectHistory() {
    return { complete: true, links };
  }
});

const makeOrdersClient = notes => ({
  async get({ orderId: squareOrderId }, options) {
    assert.equal(options.maxRetries, 0);

    return {
      order: {
        id: squareOrderId,
        note: notes[squareOrderId]
      }
    };
  }
});

test("finds prior activity through Square order note", async () => {
  const result = await reconcileV3SquareLinkHistoryReadOnly({
    orderId,
    historyReader: makeHistoryReader([
      { id: "link_1", orderId: "square_1" }
    ]),
    ordersClient: makeOrdersClient({
      square_1: `ID:${orderId}`
    })
  });

  assert.equal(result.complete, true);
  assert.equal(result.priorActivityFound, true);
  assert.deepEqual(result.matchedLinkIds, ["link_1"]);
  assert.equal(result.squareRequestAuthorized, false);
});

test("combines payment-link and order-note matches", async () => {
  const result = await reconcileV3SquareLinkHistoryReadOnly({
    orderId,
    historyReader: makeHistoryReader([
      {
        id: "link_1",
        orderId: "square_1",
        paymentNote: `ID:${orderId}`
      },
      { id: "link_2", orderId: "square_2" }
    ]),
    ordersClient: makeOrdersClient({
      square_1: "Other order",
      square_2: `ID:${orderId}`
    })
  });

  assert.equal(result.complete, true);
  assert.equal(result.priorActivityFound, true);
  assert.deepEqual(
    result.matchedLinkIds,
    ["link_1", "link_2"]
  );
});

test("no history match never authorizes Square", async () => {
  const result = await reconcileV3SquareLinkHistoryReadOnly({
    orderId,
    historyReader: makeHistoryReader([
      { id: "other_link", orderId: "other_order" }
    ]),
    ordersClient: makeOrdersClient({
      other_order: "Unrelated"
    })
  });

  assert.equal(result.complete, true);
  assert.equal(result.priorActivityFound, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("incomplete history does not read Square orders", async () => {
  let orderReads = 0;

  const result = await reconcileV3SquareLinkHistoryReadOnly({
    orderId,
    historyReader: {
      async collectHistory() {
        return { complete: false, links: [] };
      }
    },
    ordersClient: {
      async get() {
        orderReads++;
        throw new Error("UNEXPECTED_READ");
      }
    }
  });

  assert.equal(result.complete, false);
  assert.equal(orderReads, 0);
  assert.equal(result.squareRequestAuthorized, false);
});

test("order read failure preserves known matches and blocks", async () => {
  const result = await reconcileV3SquareLinkHistoryReadOnly({
    orderId,
    historyReader: makeHistoryReader([
      {
        id: "known_link",
        orderId: "square_1",
        description: `signavi-v3-production-purchase-${orderId}`
      }
    ]),
    ordersClient: {
      async get() {
        throw new Error("SIMULATED_SQUARE_FAILURE");
      }
    }
  });

  assert.equal(result.complete, false);
  assert.equal(result.priorActivityFound, true);
  assert.deepEqual(result.matchedLinkIds, ["known_link"]);
  assert.equal(result.squareRequestAuthorized, false);
});

test("missing dependencies fail closed", async () => {
  const result = await reconcileV3SquareLinkHistoryReadOnly({
    orderId
  });

  assert.equal(
    result.reason,
    "TRUSTED_HISTORY_DEPENDENCIES_REQUIRED"
  );
  assert.equal(result.squareRequestAuthorized, false);
});