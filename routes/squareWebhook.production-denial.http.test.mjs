import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer } from "node:http";
import express from "express";

const originalEnvironment = {};

const configuration = {
  NODE_ENV: "test",
  SQUARE_ENVIRONMENT: "production",
  SQUARE_PRODUCTION_ACCESS_TOKEN: "SYNTHETIC_TEST_TOKEN",
  SQUARE_PRODUCTION_LOCATION_ID: "SYNTHETIC_PROD_LOC",
  SQUARE_WEBHOOK_SIGNATURE_KEY: crypto.randomBytes(32).toString("hex"),
  SQUARE_WEBHOOK_URL: "http://localhost/synthetic-production-v3-webhook"
};

for (const [name, value] of Object.entries(configuration)) {
  originalEnvironment[name] = process.env[name];
  process.env[name] = value;
}

const { default: router } = await import("./squareWebhook.js");
const { default: Order } = await import("../models/Order.js");
const { default: Invoice } = await import("../models/Invoice.js");
const { default: Operation } =
  await import("../models/SmartShippingV3PaymentOperation.js");

const app = express();

app.use("/api/square", express.raw({
  type: "application/json"
}));

app.use("/api/square", router);

const server = createServer(app);

const orderId = "507f1f77bcf86cd799439011";
const referenceId = `signavi-v3-${orderId}`;

const originalMethods = {
  findOne: Order.findOne,
  findById: Order.findById,
  findOneAndUpdate: Order.findOneAndUpdate,
  invoiceFind: Invoice.find,
  operationFind: Operation.findOne
};

const calls = {
  square: [],
  operations: 0,
  invoice: 0,
  atomic: 0
};

let mockOperation = null;

const savedOrder = {
  _id: orderId,
  storefront: "signavi_store",
  squareEnvironment: "production",
  paymentStatus: "unpaid",
  status: "payment_required",
  squareOrderId: "synthetic-square-order-001",
  squareExpectedAmountCents: 2599,
  currency: "USD"
};

Order.findOne = async () => structuredClone(savedOrder);
Order.findById = async () => structuredClone(savedOrder);

Order.findOneAndUpdate = async () => {
  calls.atomic++;
  throw new Error("PRODUCTION_V3_ATOMIC_UPDATE_FORBIDDEN");
};

Invoice.find = () => {
  calls.invoice++;
  throw new Error("PRODUCTION_V3_LEGACY_INVOICE_FALLTHROUGH");
};

Operation.findOne = () => {
  calls.operations++;

  return {
    lean: async () => mockOperation
  };
};

let squareReference = referenceId;

app.set("squareWebhookTestFetch", async url => {
  const parsed = new URL(url);

  assert.equal(parsed.hostname, "connect.squareup.com");

  calls.square.push(parsed.pathname);

  if (parsed.pathname === "/v2/payments/synthetic-payment-001") {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        payment: {
          id: "synthetic-payment-001",
          status: "COMPLETED",
          order_id: "synthetic-square-order-001",
          location_id: "SYNTHETIC_PROD_LOC",
          amount_money: {
            amount: 2599,
            currency: "USD"
          }
        }
      })
    };
  }

  if (parsed.pathname === "/v2/orders/synthetic-square-order-001") {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        order: {
          id: "synthetic-square-order-001",
          reference_id: squareReference,
          location_id: "SYNTHETIC_PROD_LOC",
          total_money: {
            amount: 2599,
            currency: "USD"
          }
        }
      })
    };
  }

  throw new Error("UNEXPECTED_SQUARE_ENDPOINT");
});

function resetCounts() {
  calls.square.length = 0;
  calls.operations = 0;
  calls.invoice = 0;
  calls.atomic = 0;
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

  const signature = crypto
    .createHmac(
      "sha256",
      configuration.SQUARE_WEBHOOK_SIGNATURE_KEY
    )
    .update(configuration.SQUARE_WEBHOOK_URL, "utf8")
    .update(body)
    .digest("base64");

  return fetch(`${base}/api/square/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-square-hmacsha256-signature": signature
    },
    body
  });
}

let started = false;

try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  started = true;

  const base = `http://127.0.0.1:${server.address().port}`;

  await test(
    "Invalid production V3 reference never reaches legacy reconciliation",
    async () => {
      resetCounts();
      squareReference = "signavi-v3-invalid-reference";

      const result = await send(base);

      assert.equal(result.status, 200);
      assert.equal(calls.square.length, 2);
      assert.equal(calls.operations, 0);
      assert.equal(calls.invoice, 0);
      assert.equal(calls.atomic, 0);
    }
  );

  await test(
    "Production V3 missing operation cannot mark order paid",
    async () => {
      resetCounts();
      squareReference = referenceId;
      mockOperation = null;

      const result = await send(base);

      assert.equal(result.status, 200);
      assert.equal(calls.square.length, 2);
      assert.equal(calls.operations, 1);
      assert.equal(calls.invoice, 0);
      assert.equal(calls.atomic, 0);
    }
  );


  await test(
    "Valid production V3 binding verifies but cannot mark order paid",
    async () => {
      resetCounts();

      squareReference = referenceId;

      mockOperation = {
        orderId,
        environment: "production",
        status: "reconciliation_required",
        requestOwner: "synthetic-production-test-owner",
        idempotencyKey:
          "signavi-v3-production-synthetic-test",
        squarePaymentLinkId: "synthetic-production-link-001",
        squareOrderId: "synthetic-square-order-001",
        paymentUrl:
          "https://square.link/synthetic-production-test",
        checkoutReferenceId: referenceId,
        amountCents: 2599
      };

      const originalLog = console.log;
      const logs = [];

      let result;

      try {
        console.log = (...args) => {
          logs.push(args.map(String).join(" "));
        };

        result = await send(base);
      } finally {
        console.log = originalLog;
      }

      assert.equal(result.status, 200);

      assert.deepEqual(calls.square, [
        "/v2/payments/synthetic-payment-001",
        "/v2/orders/synthetic-square-order-001"
      ]);

      assert.equal(calls.operations, 1);
      assert.equal(calls.invoice, 0);
      assert.equal(calls.atomic, 0);

      assert.equal(savedOrder.paymentStatus, "unpaid");
      assert.equal(savedOrder.status, "payment_required");

      assert.ok(
        logs.some(message =>
          message.includes(
            "Production V3 payment binding verified; reconciliation disabled"
          )
        ),
        "The successful production V3 verification branch must execute."
      );

      originalLog(
        "VALID_PRODUCTION_V3_BINDING_VERIFIED_RECONCILIATION_DISABLED"
      );
    }
  );

} finally {
  app.set("squareWebhookTestFetch", null);

  if (started) {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }

  Order.findOne = originalMethods.findOne;
  Order.findById = originalMethods.findById;
  Order.findOneAndUpdate = originalMethods.findOneAndUpdate;
  Invoice.find = originalMethods.invoiceFind;
  Operation.findOne = originalMethods.operationFind;

  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}
