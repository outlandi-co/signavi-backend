import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3FirstPaymentStrictReview
} from "../utils/collectV3FirstPaymentStrictReview.js";

const orderId = "0123456789abcdef01234567";

const source = () => ({
  orderId,
  environment: "sandbox",
  complete: true,
  hasMore: false,
  timedOut: false,
  priorActivityFound: false,
  existingPayment: false,
  existingLink: false,
  conflicting: false,
  identityMismatch: false
});

const readers = () => ({
  orderId,
  environment: "sandbox",
  readKnownHistory: async () => ({
    orderId,
    environment: "sandbox",
    knownRecordsClear: true
  }),
  readPaymentLinks: async () => source(),
  readSquareOrders: async () => source(),
  readSquarePayments: async () => source(),
  readOwnership: async () => ({
    orderId,
    environment: "sandbox",
    exclusive: true,
    durable: true
  })
});

function noPaymentAuthority(result) {
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(Object.isFrozen(result), true);
}

test("complete mocked readers produce review only", async () => {
  const result = await collectV3FirstPaymentStrictReview(readers());

  assert.equal(result.readyForAuthorizationReview, true);
  noPaymentAuthority(result);
});

test("partial Square evidence is rejected", async () => {
  const input = readers();
  input.readSquarePayments = async () => ({
    orderId,
    environment: "sandbox",
    complete: true
  });

  const result = await collectV3FirstPaymentStrictReview(input);

  assert.equal(result.readyForAuthorizationReview, false);
  noPaymentAuthority(result);
});

test("wrong order identity is rejected", async () => {
  const input = readers();
  input.readPaymentLinks = async () => ({
    ...source(),
    orderId: "aaaaaaaaaaaaaaaaaaaaaaaa"
  });

  const result = await collectV3FirstPaymentStrictReview(input);

  assert.equal(result.readyForAuthorizationReview, false);
  noPaymentAuthority(result);
});

test("wrong Square environment is rejected", async () => {
  const input = readers();
  input.readSquareOrders = async () => ({
    ...source(),
    environment: "production"
  });

  const result = await collectV3FirstPaymentStrictReview(input);

  assert.equal(result.readyForAuthorizationReview, false);
  noPaymentAuthority(result);
});

test("missing reader fails closed", async () => {
  const input = readers();
  delete input.readSquarePayments;

  const result = await collectV3FirstPaymentStrictReview(input);

  assert.equal(result.reason, "TRUSTED_READER_MISSING");
  noPaymentAuthority(result);
});

test("reader exception fails closed", async () => {
  const input = readers();
  input.readSquarePayments = async () => {
    throw new Error("Mock timeout");
  };

  const result = await collectV3FirstPaymentStrictReview(input);

  assert.equal(result.readyForAuthorizationReview, false);
  noPaymentAuthority(result);
});

test("prior payment blocks review", async () => {
  const input = readers();
  input.readSquarePayments = async () => ({
    ...source(),
    existingPayment: true
  });

  const result = await collectV3FirstPaymentStrictReview(input);

  assert.equal(result.readyForAuthorizationReview, false);
  noPaymentAuthority(result);
});

test("incomplete pagination blocks review", async () => {
  const input = readers();
  input.readSquareOrders = async () => ({
    ...source(),
    hasMore: true
  });

  const result = await collectV3FirstPaymentStrictReview(input);

  assert.equal(result.readyForAuthorizationReview, false);
  noPaymentAuthority(result);
});
