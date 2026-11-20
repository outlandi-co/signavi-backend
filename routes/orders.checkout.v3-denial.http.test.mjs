import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:http";
import express from "express";
import Order from "../models/Order.js";

import {
  createGuestCheckoutToken
} from "../utils/guestCheckoutToken.js";

import {
  createV3OrderFingerprint
} from "../utils/smartShippingV3OrderFingerprint.js";

import {
  verifyV3CheckoutShipping
} from "../utils/smartShippingV3CheckoutVerification.js";

import {
  prepareV3CheckoutPayment
} from "../utils/smartShippingV3PaymentPreparation.js";

import * as quoteSigning from "../utils/smartShippingV3QuoteSigning.js";

const previousEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT,
  SMART_SHIPPING_V3_ENABLED: process.env.SMART_SHIPPING_V3_ENABLED,
  SHIPPING_QUOTE_SECRET: process.env.SHIPPING_QUOTE_SECRET
};

const testSecret = crypto.randomBytes(32).toString("hex");

process.env.NODE_ENV = "test";
process.env.SQUARE_ENVIRONMENT = "production";
process.env.SMART_SHIPPING_V3_ENABLED = "true";
process.env.SHIPPING_QUOTE_SECRET = testSecret;

// Configure any additional V3 quote signing key used by this
// repository with the same synthetic test-only secret.
const signingSource = fs.readFileSync(
  new URL("../utils/smartShippingV3QuoteSigning.js", import.meta.url),
  "utf8"
);

const additionalSecretNames = [
  ...new Set(
    [...signingSource.matchAll(
      /process\.env\.([A-Z][A-Z0-9_]*(?:SECRET|KEY)[A-Z0-9_]*)/g
    )].map(match => match[1])
  )
];

const savedSecretValues = new Map();

for (const name of additionalSecretNames) {
  if (name === "SHIPPING_QUOTE_SECRET") continue;

  savedSecretValues.set(name, process.env[name]);
  process.env[name] = testSecret;
}

const { default: router } = await import("./orders.js");

const signingExportName = Object.keys(quoteSigning).find(
  name => /^(create|sign).*quote/i.test(name)
);

if (!signingExportName) {
  throw new Error(
    "V3 quote signer export not found. Inspect smartShippingV3QuoteSigning.js."
  );
}

const signQuote = quoteSigning[signingExportName];

const originalFindById = Order.findById;
const orderId = "507f1f77bcf86cd799439011";

let lookupResult = null;
let lookupCount = 0;
let saveCount = 0;

Order.findById = async () => {
  lookupCount++;
  return lookupResult;
};

const app = express();
app.use(express.json());
app.use("/api/orders", router);

const server = createServer(app);

function syntheticOrder(storefront) {
  return {
    _id: orderId,
    storefront,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    customerName: "Synthetic Checkout Customer",
    email: "checkout@example.invalid",
    subtotal: 20,
    tax: 1.65,
    finalPrice: 21.65,
    items: [{
      productId: "507f1f77bcf86cd799439012",
      quantity: 1,
      finalPrice: 20,
      variant: {
        color: "Black",
        size: "M"
      }
    }],
    address: {
      street: "123 Test Street",
      city: "Test City",
      state: "CA",
      zip: "90001",
      country: "US"
    },
    async save() {
      saveCount++;
      throw new Error("UNEXPECTED_ORDER_SAVE");
    }
  };
}

function createFixture(order) {
  const guestToken = createGuestCheckoutToken(order);

  const cartFingerprint =
    createV3OrderFingerprint(order);

  const signedQuote = signQuote({
    cartFingerprint,
    shippingAmountCents: 599,
    parcelRateIds: ["synthetic-rate-001"],
    carrier: "USPS",
    serviceToken: "usps_priority"
  });

  const verified = verifyV3CheckoutShipping({
    order,
    guestToken,
    signedQuote
  });

  assert.ok(
    verified,
    "Synthetic shipping quote must pass real verification"
  );

  const prepared = prepareV3CheckoutPayment({
    order,
    guestToken,
    signedQuote
  });

  assert.ok(
    prepared,
    "Synthetic order must pass real payment preparation"
  );

  return { guestToken, signedQuote };
}

async function startServer() {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  return `http://127.0.0.1:${server.address().port}`;
}

function restoreEnvironment(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

let started = false;

try {
  const base = await startServer();
  started = true;

  for (const storefront of [
    "signavi_store",
    "signavi_studio"
  ]) {
    await test(
      `Production V3 ${storefront} checkout denies payment execution`,
      async () => {
        lookupCount = 0;
        saveCount = 0;

        lookupResult = syntheticOrder(storefront);

        const { guestToken, signedQuote } =
          createFixture(lookupResult);

        const response = await fetch(
          `${base}/api/orders/${orderId}/checkout`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-signavi-guest-checkout-token": guestToken
            },
            body: JSON.stringify({
              v3ShippingQuote: signedQuote
            })
          }
        );

        const body = await response.json();

        assert.equal(response.status, 423);
        assert.equal(
          body.code,
          "V3_PRODUCTION_CHECKOUT_NOT_ACTIVATED"
        );
        assert.equal(body.paymentCreated, false);
        assert.equal(body.squareRequestAuthorized, false);
        assert.equal(body.retryAuthorized, false);
        assert.equal(lookupCount, 1);
        assert.equal(saveCount, 0);
      }
    );
  }
} finally {
  Order.findById = originalFindById;

  if (started) {
    await new Promise((resolve, reject) => {
      server.close(error =>
        error ? reject(error) : resolve()
      );
    });
  }

  for (const [name, value] of Object.entries(previousEnvironment)) {
    restoreEnvironment(name, value);
  }

  for (const [name, value] of savedSecretValues) {
    restoreEnvironment(name, value);
  }
}
