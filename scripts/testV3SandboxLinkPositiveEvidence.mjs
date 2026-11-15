import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3SandboxLinkEvidenceReader
} from "../utils/createV3SandboxLinkEvidenceReader.js";

const orderId = "a".repeat(24);

function createReader(history, ordersClient = {
  async get() {
    return { order: {} };
  }
}) {
  return createV3SandboxLinkEvidenceReader({
    historyReader: {
      async collectHistory() {
        return history;
      }
    },
    ordersClient
  });
}

function locked(result) {
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
}

test("empty link history remains unknown", async () => {
  const reader = createReader({
    complete: true,
    links: []
  });

  const result = await reader({ orderId });

  assert.equal(result.complete, true);
  assert.deepEqual(result.matchedLinkIds, []);
  assert.equal(Object.hasOwn(result, "existingLink"), false);
  locked(result);
});

test("incomplete history cannot assert a link is absent", async () => {
  const reader = createReader({
    complete: false,
    links: []
  });

  const result = await reader({ orderId });

  assert.equal(result.complete, false);
  assert.equal(Object.hasOwn(result, "existingLink"), false);
  locked(result);
});

test("missing dependencies fail closed", async () => {
  const reader = createV3SandboxLinkEvidenceReader({});

  const result = await reader({ orderId });

  assert.equal(result.complete, false);
  assert.equal(Object.hasOwn(result, "existingLink"), false);
  locked(result);
});

test("invalid order identity cannot establish link evidence", async () => {
  const reader = createReader({
    complete: true,
    links: []
  });

  const result = await reader({
    orderId: "invalid-order"
  });

  assert.equal(result.complete, false);
  assert.equal(Object.hasOwn(result, "existingLink"), false);
  locked(result);
});

test("matching historical link produces positive-only evidence", async () => {
  const reader = createReader({
    complete: true,
    links: [{
      id: "known_link",
      orderId: "square_1",
      description: `signavi-v3-production-purchase-${orderId}`
    }]
  });

  const result = await reader({ orderId });

  // The minimal Square order mock cannot establish completion.
  // A known matching link must still be preserved.
  assert.equal(result.complete, false);
  assert.equal(result.existingLink, true);
  assert.equal(result.priorActivityFound, true);
  assert.deepEqual(result.matchedLinkIds, ["known_link"]);
  assert.equal(Object.hasOwn(result, "existingPayment"), false);
  locked(result);
});

test("matching link survives a subsequent Square order lookup failure", async () => {
  const reader = createReader(
    {
      complete: true,
      links: [{
        id: "known_link",
        orderId: "square_1",
        description: `signavi-v3-production-purchase-${orderId}`
      }]
    },
    {
      async get() {
        throw new Error("SIMULATED_SQUARE_ORDER_FAILURE");
      }
    }
  );

  const result = await reader({ orderId });

  assert.equal(result.complete, false);
  assert.equal(result.existingLink, true);
  assert.equal(result.priorActivityFound, true);
  assert.deepEqual(result.matchedLinkIds, ["known_link"]);
  locked(result);
});

test("positive link observation is diagnostic, never authorization", async () => {
  const reader = createReader({
    complete: true,
    links: [{
      id: "known_link",
      orderId: "square_1",
      description: `signavi-v3-production-purchase-${orderId}`
    }]
  });

  const result = await reader({ orderId });

  assert.equal(result.existingLink, true);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(Object.hasOwn(result, "existingPayment"), false);
});
