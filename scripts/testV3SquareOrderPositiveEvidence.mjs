import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3SandboxOrderRecordEvidence
} from "../utils/collectV3SandboxOrderRecordEvidence.js";

const orderId = "a".repeat(24);

const read = listPage =>
  collectV3SandboxOrderRecordEvidence({
    orderId,
    listPage
  });

function locked(result) {
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
}

test("matching Square order records positive evidence", async () => {
  const result = await read(async () => ({
    orders: [{
      id: "square-order-1",
      referenceId: `signavi-v3-sandbox-${orderId}`
    }],
    cursor: null
  }));

  assert.equal(result.existingOrder, true);
  assert.equal(result.priorActivityFound, true);
  locked(result);
});

test("empty history never claims no existing order", async () => {
  const result = await read(async () => ({
    orders: [],
    cursor: null
  }));

  assert.equal(result.complete, true);
  assert.equal(Object.hasOwn(result, "existingOrder"), false);
  locked(result);
});

test("unrelated orders do not establish clearance", async () => {
  const result = await read(async () => ({
    orders: [{
      id: "unrelated",
      referenceId: "different-purchase"
    }],
    cursor: null
  }));

  assert.equal(Object.hasOwn(result, "existingOrder"), false);
  locked(result);
});

test("known order remains recorded after later read failure", async () => {
  let count = 0;

  const result = await read(async () => {
    count++;

    if (count === 1) {
      return {
        orders: [{
          id: "square-order-1",
          referenceId: `signavi-v3-sandbox-${orderId}`
        }],
        cursor: "page-two"
      };
    }

    throw new Error("synthetic-reader-failure");
  });

  assert.equal(result.complete, false);
  assert.equal(result.priorActivityFound, true);
  assert.equal(result.existingOrder, true);
  locked(result);
});

test("existing order is not proof of payment or link", async () => {
  const result = await read(async () => ({
    orders: [{
      id: "square-order-1",
      referenceId: `signavi-v3-sandbox-${orderId}`
    }],
    cursor: null
  }));

  assert.equal(result.existingOrder, true);
  assert.equal(Object.hasOwn(result, "existingPayment"), false);
  assert.equal(Object.hasOwn(result, "existingLink"), false);
  locked(result);
});
