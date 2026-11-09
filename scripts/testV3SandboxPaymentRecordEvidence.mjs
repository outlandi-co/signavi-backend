import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3SandboxPaymentRecordEvidence
} from "../utils/collectV3SandboxPaymentRecordEvidence.js";

const orderId = "507f1f77bcf86cd799439011";

const collect = (listPage, extra = {}) =>
  collectV3SandboxPaymentRecordEvidence({
    orderId,
    listPage,
    ...extra
  });

test("empty payment history never authorizes Square", async () => {
  const result = await collect(async () => ({
    payments: []
  }));

  assert.equal(result.complete, true);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("matching prior payment is detected", async () => {
  const result = await collect(async () => ({
    payments: [{
      id: "payment_1",
      referenceId: `ID:${orderId}`
    }]
  }));

  assert.equal(result.priorActivityFound, true);
  assert.equal(result.squareRequestAuthorized, false);
});

test("unidentified payment blocks clearance", async () => {
  const result = await collect(async () => ({
    payments: [{ id: "payment_unknown" }]
  }));

  assert.equal(result.complete, false);
  assert.equal(result.reason,
    "SQUARE_PAYMENT_REFERENCE_MISSING");
});

test("payment pagination is exhausted safely", async () => {
  let calls = 0;

  const result = await collect(async ({ cursor }) => {
    calls++;

    return cursor
      ? {
          payments: [{
            id: "payment_2",
            referenceId: "other_purchase"
          }]
        }
      : {
          payments: [{
            id: "payment_1",
            referenceId: "other_purchase"
          }],
          cursor: "next_page"
        };
  });

  assert.equal(calls, 2);
  assert.equal(result.complete, true);
  assert.equal(result.squareRequestAuthorized, false);
});

test("payment page limits fail closed", async () => {
  const result = await collect(
    async ({ cursor }) => ({
      payments: [{
        id: cursor ? "payment_2" : "payment_1",
        referenceId: "other_purchase"
      }],
      cursor: cursor ? "third" : "second"
    }),
    { maxPages: 2 }
  );

  assert.equal(result.complete, false);
  assert.equal(result.reason,
    "SQUARE_PAYMENT_PAGE_LIMIT_REACHED");
});

test("Square payment lookup failures fail closed", async () => {
  const result = await collect(async () => {
    throw new Error("Simulated Square failure");
  });

  assert.equal(result.complete, false);
  assert.equal(result.reason,
    "SQUARE_PAYMENT_READ_FAILED");
});