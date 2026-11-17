import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import Order from "../models/Order.js";
import Invoice from "../models/Invoice.js";
import SmartShippingV3PaymentOperation from "../models/SmartShippingV3PaymentOperation.js";

const previous = {
  NODE_ENV: process.env.NODE_ENV,
  SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT,
  SQUARE_SANDBOX_ACCESS_TOKEN:
    process.env.SQUARE_SANDBOX_ACCESS_TOKEN,
  SQUARE_SANDBOX_LOCATION_ID:
    process.env.SQUARE_SANDBOX_LOCATION_ID,
  SQUARE_WEBHOOK_SIGNATURE_KEY:
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY,
  SQUARE_WEBHOOK_URL: process.env.SQUARE_WEBHOOK_URL
};

const key = crypto.randomBytes(32).toString("hex");
const webhookUrl = "http://localhost/synthetic-square-test";

process.env.NODE_ENV = "test";
process.env.SQUARE_ENVIRONMENT = "sandbox";
process.env.SQUARE_SANDBOX_ACCESS_TOKEN =
  "SYNTHETIC_NO_REAL_SQUARE_ACCESS";
process.env.SQUARE_SANDBOX_LOCATION_ID = "SYNTHETIC_LOC";
process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = key;
process.env.SQUARE_WEBHOOK_URL = webhookUrl;

const { default: router } = await import("./squareWebhook.js");

const app = express();

app.use("/api/square", express.raw({
  type: "application/json"
}));

app.use("/api/square", router);

const server = createServer(app);

function signature(body) {
  return crypto
    .createHmac("sha256", key)
    .update(webhookUrl, "utf8")
    .update(body)
    .digest("base64");
}

async function start() {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  return "http://127.0.0.1:" + server.address().port;
}

async function send(base) {
  const body = JSON.stringify({
    type: "payment.updated",
    data: {
      object: {
        payment: {
          id: "synthetic-payment-001",
          status: "COMPLETED"
        }
      }
    }
  });

  return fetch(base + "/api/square/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-square-hmacsha256-signature": signature(body)
    },
    body
  });
}

function response(data) {
  return {
    ok: true,
    status: 200,
    async json() {
      return data;
    }
  };
}

function verifiedPayment(overrides = {}) {
  return {
    id: "synthetic-payment-001",
    status: "COMPLETED",
    order_id: "synthetic-square-order-001",
    location_id: "SYNTHETIC_LOC",
    amount_money: {
      amount: 2599,
      currency: "USD"
    },
    ...overrides
  };
}

function verifiedSquareOrder(overrides = {}) {
  return {
    id: "synthetic-square-order-001",
    location_id: "SYNTHETIC_LOC",
    total_money: {
      amount: 2599,
      currency: "USD"
    },
    ...overrides
  };
}

function setTransport(handler) {
  app.set("squareWebhookTestFetch", handler);
}

async function runScenario(base, payment, squareOrder) {
  const requested = [];

  setTransport(async (url) => {
    const parsed = new URL(url);

    assert.equal(
      parsed.hostname,
      "connect.squareupsandbox.com"
    );

    requested.push(parsed.pathname);

    if (parsed.pathname.endsWith("/payments/synthetic-payment-001")) {
      return response({ payment });
    }

    if (parsed.pathname.endsWith("/orders/synthetic-square-order-001")) {
      return response({ order: squareOrder });
    }

    throw new Error("UNEXPECTED_SQUARE_TEST_ENDPOINT");
  });

  const httpResponse = await send(base);

  return {
    status: httpResponse.status,
    requested
  };
}

function restore(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

let started = false;

try {
  const base = await start();
  started = true;

  await test("Completed event without mocked Square transport fails closed", async () => {
    app.set("squareWebhookTestFetch", null);

    const result = await send(base);

    assert.equal(result.status, 503);
  });

  await test("Unverified completed payment status is ignored", async () => {
    const result = await runScenario(
      base,
      verifiedPayment({ status: "PENDING" }),
      verifiedSquareOrder()
    );

    assert.equal(result.status, 200);
    assert.equal(result.requested.length, 1);
  });

  await test("Square payment with wrong location is rejected", async () => {
    const result = await runScenario(
      base,
      verifiedPayment({
        location_id: "WRONG_LOCATION"
      }),
      verifiedSquareOrder()
    );

    assert.equal(result.status, 200);
    assert.equal(result.requested.length, 1);
  });

  await test("Mismatched verified Square total is rejected", async () => {
    const result = await runScenario(
      base,
      verifiedPayment(),
      verifiedSquareOrder({
        total_money: {
          amount: 9999,
          currency: "USD"
        }
      })
    );

    assert.equal(result.status, 200);
    assert.equal(result.requested.length, 2);
  });

  // Verified Square data, isolated database lookups.
  // An attempted payment update is a test failure.

  async function verifyRejection(base, overrides) {
    const originals = {
      findOne: Order.findOne,
      findOneAndUpdate: Order.findOneAndUpdate,
      invoiceFind: Invoice.find,
      operationFind: SmartShippingV3PaymentOperation.findOne
    };

    let lookups = 0;
    let updateAttempts = 0;

    const savedOrder = {
      _id: "507f1f77bcf86cd799439011",
      storefront: "signavi_store",
      source: "store",
      squareEnvironment: "sandbox",
      squareOrderId: "synthetic-square-order-001",
      squareExpectedAmountCents: 2599,
      paymentStatus: "unpaid",
      status: "payment_required",
      finalPrice: 25.99,
      ...overrides
    };

    Order.findOne = async () => {
      lookups++;
      return savedOrder;
    };

    Invoice.find = () => ({
      limit: async () => []
    });

    SmartShippingV3PaymentOperation.findOne = () => ({
      lean: async () => null
    });

    Order.findOneAndUpdate = async () => {
      updateAttempts++;
      throw new Error("UNEXPECTED_PAYMENT_UPDATE");
    };

    try {
      const result = await runScenario(
        base,
        verifiedPayment(),
        verifiedSquareOrder()
      );

      assert.equal(result.status, 200);
      assert.equal(result.requested.length, 2);
      assert.equal(lookups, 1);
      assert.equal(updateAttempts, 0);
    } finally {
      Order.findOne = originals.findOne;
      Order.findOneAndUpdate = originals.findOneAndUpdate;
      Invoice.find = originals.invoiceFind;
      SmartShippingV3PaymentOperation.findOne =
        originals.operationFind;
    }
  }

  await test(
    "Wrong saved Square environment rejects payment",
    async () => {
      await verifyRejection(base, {
        squareEnvironment: "production"
      });
    }
  );

  await test(
    "Conflicting Square order ID rejects payment",
    async () => {
      await verifyRejection(base, {
        squareOrderId: "different-square-order"
      });
    }
  );

  await test(
    "Incorrect saved payment amount rejects payment",
    async () => {
      await verifyRejection(base, {
        squareExpectedAmountCents: 3000
      });
    }
  );

  await test(
    "Conflicting Square payment ID rejects payment",
    async () => {
      await verifyRejection(base, {
        squarePaymentId: "another-payment-id"
      });
    }
  );

  await test(
    "Closed shipped order rejects completed payment",
    async () => {
      await verifyRejection(base, {
        status: "shipped"
      });
    }
  );
} finally {
  app.set("squareWebhookTestFetch", null);

  if (started) {
    await new Promise((resolve, reject) => {
      server.close(error =>
        error ? reject(error) : resolve()
      );
    });
  }

  for (const [name, value] of Object.entries(previous)) {
    restore(name, value);
  }
}
