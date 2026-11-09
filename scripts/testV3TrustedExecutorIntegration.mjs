import test from "node:test";
import assert from "node:assert/strict";

import {
  runV3TrustedProductionCheckoutExecutor
} from "../utils/runV3TrustedProductionCheckoutExecutor.js";

const orderId = "507f1f77bcf86cd799439011";
const purchaseKey = `signavi-v3-production-purchase-${orderId}`;
const owner = "checkout:integration-test-owner";
const amountCents = 2500;

function createHarness(overrides = {}) {
  const calls = {
    square: 0,
    claim: 0,
    verify: 0,
    record: 0,
    hold: 0
  };

  const dependencies = {
    orderId,
    purchaseKey,
    owner,
    amountCents,
    locationId: "L123456789ABCDEF",
    redirectUrl: `https://signavi.store/success/${orderId}`,

    checkoutClient: {
      paymentLinks: {
        create: async () => {
          calls.square++;
          throw new Error(
            "MOCK_SQUARE_EXECUTION_MUST_NOT_BE_REACHED"
          );
        }
      }
    },

    claimFresh: async () => {
      calls.claim++;
      return { claimed: false };
    },

    verifyOwnership: async () => {
      calls.verify++;
      return { verified: false };
    },

    recordLink: async () => {
      calls.record++;
      return { recorded: false };
    },

    holdUncertain: async () => {
      calls.hold++;
      return { held: true };
    },

    ...overrides
  };

  return { dependencies, calls };
}

test("invalid order cannot create Square link", async () => {
  const { dependencies, calls } = createHarness({
    orderId: "invalid"
  });

  const result =
    await runV3TrustedProductionCheckoutExecutor(
      dependencies
    );

  assert.notEqual(result?.status, "link_recorded");
  assert.equal(calls.square, 0);
  assert.equal(calls.claim, 0);
});

test("rejected durable claim prevents Square execution", async () => {
  const { dependencies, calls } = createHarness();

  const result =
    await runV3TrustedProductionCheckoutExecutor(
      dependencies
    );

  console.log("EXECUTOR RESULT:", JSON.stringify(result));
  console.log("MOCK CALL COUNTS:", JSON.stringify(calls));

  assert.notEqual(result?.status, "link_recorded");
  assert.equal(calls.square, 0);
  assert.equal(calls.claim, 1);
  assert.equal(calls.record, 0);
});

test("invalid claim identity prevents Square execution", async () => {
  const { dependencies, calls } = createHarness({
    claimFresh: async () => {
      calls.claim++;

      return {
        claimed: true,
        orderId,
        owner,
        amountCents,
        squareIdempotencyKey: "WRONG_IDEMPOTENCY_KEY"
      };
    }
  });

  const result =
    await runV3TrustedProductionCheckoutExecutor(
      dependencies
    );

  assert.notEqual(result?.status, "link_recorded");
  assert.equal(calls.square, 0);
  assert.equal(calls.record, 0);
});

test("missing Square client fails closed", async () => {
  const { dependencies, calls } = createHarness({
    checkoutClient: null
  });

  const result =
    await runV3TrustedProductionCheckoutExecutor(
      dependencies
    );

  assert.notEqual(result?.status, "link_recorded");
  assert.equal(calls.square, 0);
  assert.equal(calls.claim, 0);
});