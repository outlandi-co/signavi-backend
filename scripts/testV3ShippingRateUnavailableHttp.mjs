import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";

import {
  createV3StorefrontShippingQuoteRouter
} from "../routes/v3StorefrontShippingQuote.js";

import {
  createGuestCheckoutToken
} from "../utils/guestCheckoutToken.js";

process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex");

process.env.SHIPPING_V3_QUOTE_SECRET =
  crypto.randomBytes(48).toString("hex");

const order = {
  _id: "507f1f77bcf86cd799439011",
  source: "store",
  status: "payment_required",
  paymentStatus: "unpaid",
  customerName: "Test Customer",
  address: {
    street: "123 Example Street",
    city: "Merced",
    state: "CA",
    zip: "95340",
    country: "US"
  },
  items: [{
    productId: "507f191e810c19729de860ea",
    quantity: 2,
    finalPrice: 20,
    variant: {
      color: "black",
      size: "L"
    }
  }]
};

const token = createGuestCheckoutToken(order);

async function requestFailure({
  errorMessage,
  guestToken = token
}) {
  let carrierCalls = 0;

  const app = express();
  app.use(express.json());

  app.use(
    "/api/v3/shipping",
    createV3StorefrontShippingQuoteRouter({
      findOrder: async id =>
        id === String(order._id) ? order : null,
      getTrustedShipments: async () => {
        carrierCalls++;
        throw new Error(errorMessage);
      }
    })
  );

  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise((resolve, reject) => {
      if (server.listening) return resolve();
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const response = await fetch(
      `http://127.0.0.1:${server.address().port}` +
        `/api/v3/shipping/${order._id}/quote`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signavi-guest-checkout-token": guestToken
        },
        body: "{}"
      }
    );

    return {
      status: response.status,
      body: await response.json(),
      carrierCalls
    };
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close(error => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  }
}

test("unauthorized requests never reach carrier provider", async () => {
  const result = await requestFailure({
    errorMessage: "Incomplete carrier shipment rates.",
    guestToken: "invalid-token"
  });

  assert.equal(result.status, 403);
  assert.equal(result.carrierCalls, 0);
  assert.equal(result.body.success, false);
});

test("empty carrier rates return HTTP 503", async () => {
  const result = await requestFailure({
    errorMessage: "Incomplete carrier shipment rates."
  });

  assert.equal(result.status, 503);
  assert.equal(result.carrierCalls, 1);
  assert.equal(result.body.success, false);
  assert.equal(
    result.body.code,
    "SHIPPING_RATES_UNAVAILABLE"
  );
  assert.match(
    result.body.message,
    /Shipping rates are temporarily unavailable/
  );
});

test("unexpected provider failure returns HTTP 502", async () => {
  const result = await requestFailure({
    errorMessage: "Unexpected provider failure."
  });

  assert.equal(result.status, 502);
  assert.equal(result.carrierCalls, 1);
  assert.equal(result.body.success, false);
  assert.equal(
    result.body.message,
    "Shipping quote unavailable."
  );
  assert.equal(result.body.code, undefined);
});