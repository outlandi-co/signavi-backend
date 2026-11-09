import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import mongoose from "mongoose";

import ProductionReservation from
  "../models/SmartShippingV3ProductionPurchaseReservation.js";

import SharedReservation from
  "../models/SharedSquarePaymentReservation.js";

import {
  createV3ProductionCheckoutService
} from "../utils/createV3ProductionCheckoutService.js";

test("production service uses the production purchase reservation", () => {
  const source = readFileSync(
    new URL("../utils/createV3ProductionCheckoutService.js", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /import Reservation from "\.\.\/models\/SmartShippingV3ProductionPurchaseReservation\.js"/
  );

  assert.doesNotMatch(
    source,
    /import Reservation from "\.\.\/models\/SharedSquarePaymentReservation\.js"/
  );
});

test("production reservation has the transactional claim contract", () => {
  const schema = ProductionReservation.schema;

  assert.equal(
    ProductionReservation.collection.name,
    "smart_shipping_v3_production_purchase_reservations"
  );

  for (const field of [
    "environment",
    "orderId",
    "purchaseKey",
    "idempotencyKey",
    "claimedByDocumentType",
    "claimedByDocumentId",
    "status",
    "checkoutClaimOwner",
    "checkoutClaimAmountCents",
    "attemptClaimedAt"
  ]) {
    assert.ok(schema.path(field), `Missing field: ${field}`);
  }

  assert.ok(schema.path("status").enumValues.includes("reserved"));
  assert.ok(schema.path("status").enumValues.includes("claim_pending"));
});

test("shared and production reservations are distinct models", () => {
  assert.notEqual(
    SharedReservation.collection.name,
    ProductionReservation.collection.name
  );

  assert.equal(
    SharedReservation.schema.path("purchaseKey"),
    undefined
  );
});

test("production service rejects sandbox environment", () => {
  const original = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.SQUARE_ENVIRONMENT = "sandbox";

    assert.throws(
      () => createV3ProductionCheckoutService(),
      /PRODUCTION_CHECKOUT_ENVIRONMENT_REQUIRED/
    );
  } finally {
    if (original === undefined) {
      delete process.env.SQUARE_ENVIRONMENT;
    } else {
      process.env.SQUARE_ENVIRONMENT = original;
    }
  }
});

test("production service refuses a disconnected database", () => {
  const original = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.SQUARE_ENVIRONMENT = "production";

    assert.notEqual(mongoose.connection.readyState, 1);

    assert.throws(
      () => createV3ProductionCheckoutService(),
      /PRODUCTION_DATABASE_CONNECTION_REQUIRED/
    );
  } finally {
    if (original === undefined) {
      delete process.env.SQUARE_ENVIRONMENT;
    } else {
      process.env.SQUARE_ENVIRONMENT = original;
    }
  }
});