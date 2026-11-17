import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import Order from "../models/Order.js";
import crypto from "node:crypto";
import {
  createGuestCheckoutToken
} from "../utils/guestCheckoutToken.js";

process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex");

const { default: router } = await import("./orders.js");

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

async function startServer() {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  return `http://127.0.0.1:${server.address().port}`;
}

function syntheticOrder(storefront = "signavi_store") {
  return {
    _id: orderId,
    storefront,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    currency: "USD",
    items: [],
    async save() {
      saveCount++;
      throw new Error("UNEXPECTED_ORDER_SAVE");
    }
  };
}

async function checkout(base, id = orderId) {
  return fetch(`${base}/api/orders/${id}/checkout`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });
}

let base;

try {
  base = await startServer();

  await test("Invalid order ID returns HTTP 400", async () => {
    lookupCount = 0;
    saveCount = 0;
    lookupResult = null;

    const response = await checkout(base, "invalid-id");

    assert.equal(response.status, 400);
    assert.equal(lookupCount, 0);
    assert.equal(saveCount, 0);
  });

  await test("Missing order returns HTTP 404", async () => {
    lookupCount = 0;
    saveCount = 0;
    lookupResult = null;

    const response = await checkout(base);

    assert.equal(response.status, 404);
    assert.equal(lookupCount, 1);
    assert.equal(saveCount, 0);
  });

  await test("Invalid guest checkout token returns HTTP 403", async () => {
    lookupCount = 0;
    saveCount = 0;
    lookupResult = syntheticOrder("signavi_store");

    const response = await fetch(
      `${base}/api/orders/${orderId}/checkout`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-signavi-guest-checkout-token": "invalid-test-token"
        },
        body: JSON.stringify({})
      }
    );

    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.success, false);
    assert.equal(lookupCount, 1);
    assert.equal(saveCount, 0);
  });
  for (const storefront of [
    "signavi_store",
    "signavi_studio"
  ]) {
    await test(
      `Already-paid ${storefront} checkout returns HTTP 409`,
      async () => {
        lookupCount = 0;
        saveCount = 0;

        lookupResult = syntheticOrder(storefront);
        lookupResult.paymentStatus = "paid";

        const guestToken =
          createGuestCheckoutToken(lookupResult);

        const response = await fetch(
          `${base}/api/orders/${orderId}/checkout`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-signavi-guest-checkout-token": guestToken
            },
            body: JSON.stringify({})
          }
        );

        const body = await response.json();

        assert.equal(response.status, 409);
        assert.equal(body.success, false);
        assert.equal(lookupCount, 1);
        assert.equal(saveCount, 0);
      }
    );
  }
  for (const storefront of [
    "signavi_store",
    "signavi_studio"
  ]) {
    await test(
      `${storefront} checkout without guest token returns 403`,
      async () => {
        lookupCount = 0;
        saveCount = 0;
        lookupResult = syntheticOrder(storefront);

        const response = await checkout(base);
        const body = await response.json();

        assert.equal(response.status, 403);
        assert.equal(body.success, false);
        assert.equal(lookupCount, 1);
        assert.equal(saveCount, 0);
      }
    );
  }

} finally {
  Order.findById = originalFindById;

  await new Promise((resolve, reject) => {
    server.close(error => {
      if (error) reject(error);
      else resolve();
    });
  });
}
