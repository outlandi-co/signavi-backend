import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import Order from "../models/Order.js";

import {
  createV3ProductionCheckoutActivation
} from "../utils/createV3ProductionCheckoutActivation.js";

const order = {
  _id: "507f1f77bcf86cd799439011"
};

test("production activation requires trusted Order model", async () => {
  const activate = createV3ProductionCheckoutActivation();

  const result = await activate({
    order,
    guestToken: "test-token",
    signedQuote: "test-quote"
  });

  assert.equal(result.ready, false);
  assert.equal(result.httpStatus, 423);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.reason, "TRUSTED_REPOSITORIES_REQUIRED");
});

test("sandbox environment cannot activate production checkout", async () => {
  const original = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.SQUARE_ENVIRONMENT = "sandbox";

    const activate = createV3ProductionCheckoutActivation({
      Order
    });

    const result = await activate({
      order,
      guestToken: "test-token",
      signedQuote: "test-quote"
    });

    assert.equal(result.ready, false);
    assert.equal(result.httpStatus, 423);
    assert.equal(result.squareRequestAuthorized, false);
  } finally {
    if (original === undefined) {
      delete process.env.SQUARE_ENVIRONMENT;
    } else {
      process.env.SQUARE_ENVIRONMENT = original;
    }
  }
});

test("disconnected production database cannot initialize checkout", async () => {
  const original = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.SQUARE_ENVIRONMENT = "production";

    assert.notEqual(mongoose.connection.readyState, 1);

    const activate = createV3ProductionCheckoutActivation({
      Order
    });

    const result = await activate({
      order,
      guestToken: "test-token",
      signedQuote: "test-quote"
    });

    assert.equal(result.ready, false);
    assert.equal(result.httpStatus, 423);
    assert.equal(result.squareRequestAuthorized, false);
    assert.equal(result.retryAuthorized, false);
    assert.equal(result.reason, "PRODUCTION_ENVIRONMENT_NOT_READY");
  } finally {
    if (original === undefined) {
      delete process.env.SQUARE_ENVIRONMENT;
    } else {
      process.env.SQUARE_ENVIRONMENT = original;
    }
  }
});