import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3SandboxPaymentEvidenceReader
} from "../utils/createV3SandboxPaymentEvidenceReader.js";

const orderId = "507f1f77bcf86cd799439011";

function setup(list) {
  return createV3SandboxPaymentEvidenceReader({
    testClient: {
      payments: { list }
    }
  });
}

test("SDK listing is read-only and uses Sandbox location", async () => {
  const requests = [];

  const reader = setup(async (request, options) => {
    requests.push({ request, options });

    return {
      response: {
        payments: []
      }
    };
  });

  const result = await reader({ orderId });

  assert.equal(result.complete, true);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].request.limit, 100);
  assert.equal(requests[0].request.locationId, "sandbox_test_location");
  assert.equal(requests[0].options.maxRetries, 0);
});

test("SDK cursor pagination detects existing payment", async () => {
  const requests = [];

  const reader = setup(async request => {
    requests.push(request);

    return {
      response: request.cursor
        ? {
            payments: [{
              id: "payment_2",
              referenceId: `ID:${orderId}`
            }]
          }
        : {
            payments: [{
              id: "payment_1",
              referenceId: "other_purchase"
            }],
            cursor: "page_2"
          }
    };
  });

  const result = await reader({ orderId });

  assert.equal(requests.length, 2);
  assert.equal(requests[1].cursor, "page_2");
  assert.equal(result.priorActivityFound, true);
  assert.equal(result.squareRequestAuthorized, false);
});

test("invalid SDK page fails closed", async () => {
  const reader = setup(async () => ({}));
  const result = await reader({ orderId });

  assert.equal(result.complete, false);
  assert.equal(result.reason, "SQUARE_PAYMENT_READ_FAILED");
});

test("SDK failure fails closed", async () => {
  const reader = setup(async () => {
    throw new Error("Simulated failure");
  });

  const result = await reader({ orderId });

  assert.equal(result.complete, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("unidentified Square payment fails closed", async () => {
  const reader = setup(async () => ({
    response: {
      payments: [{ id: "unidentified" }]
    }
  }));

  const result = await reader({ orderId });

  assert.equal(result.complete, false);
  assert.equal(
    result.reason,
    "SQUARE_PAYMENT_REFERENCE_MISSING"
  );
});

test("production environment is rejected", () => {
  const previous = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.SQUARE_ENVIRONMENT = "production";

    assert.throws(
      () => setup(async () => ({ response: { payments: [] } })),
      /SANDBOX_SQUARE_ENVIRONMENT_REQUIRED/
    );
  } finally {
    process.env.SQUARE_ENVIRONMENT = previous;
  }
});