import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3SandboxOrderHistoryReader
} from "../utils/createV3SandboxOrderHistoryReader.js";

import {
  createV3SandboxPaymentEvidenceReader
} from "../utils/createV3SandboxPaymentEvidenceReader.js";

const orderId = "507f1f77bcf86cd799439011";

function assertNotAuthorized(result) {
  assert.equal(result.complete, false);
  assert.notEqual(result.authoritativeNoPriorActivity, true);
  assert.notEqual(result.squareRequestAuthorized, true);
  assert.notEqual(result.retryAuthorized, true);
}

test("Orders pagination limit cannot establish clearance", async () => {
  let calls = 0;

  const reader = createV3SandboxOrderHistoryReader({
    testClient: {
      orders: {
        search: async () => {
          calls++;

          if (calls > 10) {
            throw new Error("ORDER_PAGE_LIMIT_EXCEEDED");
          }

          // Every page reports another cursor.
          // Therefore ten inspected pages are NOT exhaustive.
          return {
            orders: [],
            cursor: `next_order_page_${calls}`
          };
        }
      }
    }
  });

  const result = await reader({ orderId });

  assert.equal(calls, 10);
  assertNotAuthorized(result);

  console.log("PASS: ORDERS PAGE LIMIT REMAINS INCOMPLETE");
});

test("Payments pagination limit cannot establish clearance", async () => {
  let calls = 0;

  const reader = createV3SandboxPaymentEvidenceReader({
    testClient: {
      payments: {
        list: async () => {
          calls++;

          if (calls > 10) {
            throw new Error("PAYMENT_PAGE_LIMIT_EXCEEDED");
          }

          return {
            response: {
              payments: [],
              cursor: `next_payment_page_${calls}`
            }
          };
        }
      }
    }
  });

  const result = await reader({ orderId });

  assert.equal(calls, 10);
  assertNotAuthorized(result);

  console.log("PASS: PAYMENTS PAGE LIMIT REMAINS INCOMPLETE");
});
