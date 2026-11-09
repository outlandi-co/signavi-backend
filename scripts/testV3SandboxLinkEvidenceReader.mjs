import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3SandboxLinkEvidenceReader
} from "../utils/createV3SandboxLinkEvidenceReader.js";

const orderId = "507f1f77bcf86cd799439011";

const makeReader = (history, getOrder = async () => {
  throw new Error("Unexpected order lookup");
}) => createV3SandboxLinkEvidenceReader({
  historyReader: {
    collectHistory: async () => history
  },
  ordersClient: {
    get: getOrder
  }
});

test("empty Square link history grants no authorization", async () => {
  const reader = makeReader({
    complete: true,
    links: []
  });

  const result = await reader({ orderId });

  assert.equal(result.complete, true);
  assert.equal(result.priorActivityFound, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("matching historical link is detected", async () => {
  const reader = makeReader({
    complete: true,
    links: [{
      id: "link_1",
      orderId: "square_order_1",
      paymentNote: `ID:${orderId}`,
      description: ""
    }]
  }, async () => ({
    order: {
      id: "square_order_1",
      note: `ID:${orderId}`
    }
  }));

  const result = await reader({ orderId });

  assert.equal(result.priorActivityFound, true);
  assert.deepEqual(result.matchedLinkIds, ["link_1"]);
  assert.equal(result.squareRequestAuthorized, false);
});

test("incomplete Square history fails closed", async () => {
  const reader = makeReader({
    complete: false,
    links: []
  });

  const result = await reader({ orderId });

  assert.equal(result.complete, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("Square order lookup failure blocks completion", async () => {
  const reader = makeReader({
    complete: true,
    links: [{
      id: "link_2",
      orderId: "square_order_2",
      paymentNote: "",
      description: ""
    }]
  }, async () => {
    throw new Error("Simulated Square failure");
  });

  const result = await reader({ orderId });

  assert.equal(result.complete, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("missing server-owned dependencies fail closed", async () => {
  const reader = createV3SandboxLinkEvidenceReader();

  const result = await reader({ orderId });

  assert.equal(result.complete, false);
  assert.equal(
    result.reason,
    "TRUSTED_SQUARE_READERS_REQUIRED"
  );
});