import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3SandboxOrderRecordEvidence
} from "../utils/collectV3SandboxOrderRecordEvidence.js";

const orderId = "507f1f77bcf86cd799439011";

const collect = (listPage, extra = {}) =>
  collectV3SandboxOrderRecordEvidence({
    orderId,
    listPage,
    ...extra
  });

test("empty Square order history never authorizes payment", async () => {
  const result = await collect(async () => ({
    orders: []
  }));

  assert.equal(result.complete, true);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("matching pending order is detected", async () => {
  const result = await collect(async () => ({
    orders: [{
      id: "square_pending_1",
      state: "OPEN",
      referenceId: `signavi-v3-sandbox-${orderId}`
    }]
  }));

  assert.equal(result.complete, true);
  assert.equal(result.priorActivityFound, true);
  assert.equal(result.squareRequestAuthorized, false);
});

test("unidentified Square order blocks clearance", async () => {
  const result = await collect(async () => ({
    orders: [{ id: "square_unknown" }]
  }));

  assert.equal(result.complete, false);
  assert.equal(result.reason, "SQUARE_ORDER_REFERENCE_MISSING");
});

test("cursor pagination detects later match", async () => {
  let calls = 0;

  const result = await collect(async ({ cursor }) => {
    calls++;

    return cursor
      ? {
          orders: [{
            id: "square_second",
            note: `ID:${orderId}`
          }]
        }
      : {
          orders: [{
            id: "square_first",
            referenceId: "other_purchase"
          }],
          cursor: "second_page"
        };
  });

  assert.equal(calls, 2);
  assert.equal(result.priorActivityFound, true);
  assert.equal(result.squareRequestAuthorized, false);
});

test("page limit fails closed", async () => {
  const result = await collect(
    async ({ cursor }) => ({
      orders: [{
        id: cursor ? "square_second" : "square_first",
        referenceId: "other_purchase"
      }],
      cursor: cursor ? "third_page" : "second_page"
    }),
    { maxPages: 2 }
  );

  assert.equal(result.complete, false);
  assert.equal(result.reason, "SQUARE_ORDER_PAGE_LIMIT_REACHED");
});

test("duplicate order identity fails closed", async () => {
  const result = await collect(async ({ cursor }) => ({
    orders: [{
      id: "same_square_order",
      referenceId: "other_purchase"
    }],
    ...(cursor ? {} : { cursor: "second_page" })
  }));

  assert.equal(result.complete, false);
  assert.equal(result.reason, "SQUARE_ORDER_IDENTITY_INVALID");
});

test("Square order API errors fail closed", async () => {
  const result = await collect(async () => {
    throw new Error("Simulated Square search failure");
  });

  assert.equal(result.complete, false);
  assert.equal(result.reason, "SQUARE_ORDER_SEARCH_FAILED");
});