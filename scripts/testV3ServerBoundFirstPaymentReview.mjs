import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3ServerBoundFirstPaymentReview
} from "../utils/createV3ServerBoundFirstPaymentReview.js";

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

const noAuthority = (result) => {
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(Object.isFrozen(result), true);
};

test("configured mock readers produce review only", async () => {
  const service = createV3ServerBoundFirstPaymentReview(readers());
  const result = await service.review(orderId);

  assert.equal(result.readyForAuthorizationReview, true);
  noAuthority(result);
});

test("request cannot supply reader callbacks", async () => {
  const service = createV3ServerBoundFirstPaymentReview(readers());

  const result = await service.review({
    orderId,
    squareRequestAuthorized: true,
    readSquarePayments: async () => source()
  });

  assert.equal(result.reason, "INVALID_ORDER_ID");
  assert.equal(result.readyForAuthorizationReview, false);
  noAuthority(result);
});

test("reader replacement after setup has no effect", async () => {
  const config = readers();
  const service = createV3ServerBoundFirstPaymentReview(config);

  config.readSquarePayments = async () => {
    throw new Error("Replacement must not run");
  };

  const result = await service.review(orderId);

  assert.equal(result.readyForAuthorizationReview, true);
  noAuthority(result);
});

test("configured reader exception fails closed", async () => {
  const config = readers();
  config.readSquarePayments = async () => {
    throw new Error("Mock reader failure");
  };

  const service = createV3ServerBoundFirstPaymentReview(config);
  const result = await service.review(orderId);

  assert.equal(result.readyForAuthorizationReview, false);
  noAuthority(result);
});

test("production environment evidence is rejected", async () => {
  const config = readers();

  config.readPaymentLinks = async () => ({
    ...source(),
    environment: "production"
  });

  const service = createV3ServerBoundFirstPaymentReview(config);
  const result = await service.review(orderId);

  assert.equal(result.readyForAuthorizationReview, false);
  noAuthority(result);
});

test("incomplete evidence is rejected", async () => {
  const config = readers();

  config.readSquarePayments = async () => ({
    orderId,
    environment: "sandbox",
    complete: true,
    priorActivityFound: false
  });

  const service = createV3ServerBoundFirstPaymentReview(config);
  const result = await service.review(orderId);

  assert.equal(result.readyForAuthorizationReview, false);
  noAuthority(result);
});

test("invalid IDs are rejected before reading", async () => {
  let calls = 0;
  const config = readers();

  config.readSquarePayments = async () => {
    calls++;
    return source();
  };

  const service = createV3ServerBoundFirstPaymentReview(config);

  for (const input of [null, "", "wrong", {}, []]) {
    const result = await service.review(input);
    assert.equal(result.reason, "INVALID_ORDER_ID");
    noAuthority(result);
  }

  assert.equal(calls, 0);
});

test("missing configured reader is rejected", () => {
  const config = readers();
  delete config.readSquarePayments;

  assert.throws(
    () => createV3ServerBoundFirstPaymentReview(config),
    /V3_READER_CONFIGURATION_INCOMPLETE/
  );
});

test("service exposes no payment execution method", () => {
  const service = createV3ServerBoundFirstPaymentReview(readers());

  assert.equal(typeof service.review, "function");
  assert.equal(service.createPayment, undefined);
  assert.equal(service.authorizePayment, undefined);
  assert.equal(Object.isFrozen(service), true);
});
