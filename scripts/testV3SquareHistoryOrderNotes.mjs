import test from "node:test";
import assert from "node:assert/strict";

import {
  inspectV3SquareHistoryOrderNotes
} from "../utils/inspectV3SquareHistoryOrderNotes.js";

const orderId = "abcdef123456abcdef123456";

const history = (...links) => ({
  complete: true,
  links
});

const inspect = (links, reader) =>
  inspectV3SquareHistoryOrderNotes({
    orderId,
    history: history(...links),
    readSquareOrder: reader
  });

test("matches Signavi ID in legacy Square order note", async () => {
  const output = await inspect(
    [{ id: "link_1", orderId: "square_1" }],
    async ({ squareOrderId }) => ({
      order: {
        id: squareOrderId,
        note: `ID:${orderId}`
      }
    })
  );

  assert.equal(output.priorActivityFound, true);
  assert.deepEqual(output.matchedLinkIds, ["link_1"]);
  assert.equal(output.squareRequestAuthorized, false);
});

test("checks multiple orders and retains confirmed matches", async () => {
  const output = await inspect(
    [
      { id: "link_1", orderId: "square_1" },
      { id: "link_2", orderId: "square_2" }
    ],
    async ({ squareOrderId }) => ({
      order: {
        id: squareOrderId,
        note: squareOrderId === "square_2"
          ? `ID:${orderId}`
          : "ID:111111111111111111111111"
      }
    })
  );

  assert.equal(output.complete, true);
  assert.deepEqual(output.matchedLinkIds, ["link_2"]);
});

test("no matching note never authorizes payment", async () => {
  const output = await inspect(
    [{ id: "link_1", orderId: "square_1" }],
    async () => ({
      order: {
        id: "square_1",
        note: "ID:111111111111111111111111"
      }
    })
  );

  assert.equal(output.priorActivityFound, false);
  assert.equal(output.authoritativeNoPriorActivity, false);
  assert.equal(output.squareRequestAuthorized, false);
});

test("empty Square history cannot authorize payment", async () => {
  const output = await inspect([], async () => {
    throw new Error("SHOULD_NOT_RUN");
  });

  assert.equal(output.complete, true);
  assert.equal(output.authoritativeNoPriorActivity, false);
  assert.equal(output.squareRequestAuthorized, false);
});

test("missing Square order identity fails closed", async () => {
  const output = await inspect(
    [{ id: "link_1" }],
    async () => ({})
  );

  assert.equal(output.complete, false);
  assert.equal(output.reason, "SQUARE_ORDER_IDENTITY_INCOMPLETE");
});

test("SDK read failure fails closed", async () => {
  const output = await inspect(
    [{ id: "link_1", orderId: "square_1" }],
    async () => {
      throw new Error("Simulated Square failure");
    }
  );

  assert.equal(output.complete, false);
  assert.equal(output.reason, "SQUARE_ORDER_LOOKUP_FAILED");
});

test("mismatched Square order identity fails closed", async () => {
  const output = await inspect(
    [{ id: "link_1", orderId: "square_1" }],
    async () => ({
      order: { id: "different", note: `ID:${orderId}` }
    })
  );

  assert.equal(output.complete, false);
  assert.equal(output.squareRequestAuthorized, false);
});

test("incomplete pagination fails closed", async () => {
  const output = await inspectV3SquareHistoryOrderNotes({
    orderId,
    history: {
      complete: false,
      links: [{ id: "link_1", orderId: "square_1" }]
    },
    readSquareOrder: async () => ({})
  });

  assert.equal(output.complete, false);
  assert.equal(output.reason, "SQUARE_HISTORY_INCOMPLETE");
});

test("missing order note is not treated as clearance", async () => {
  const output = await inspect(
    [{ id: "link_1", orderId: "square_1" }],
    async () => ({
      order: { id: "square_1" }
    })
  );

  assert.equal(output.complete, false);
  assert.equal(output.reason, "SQUARE_ORDER_EVIDENCE_INCOMPLETE");
});