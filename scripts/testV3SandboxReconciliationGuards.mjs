import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  reconcileV3SandboxPaymentIsolated
} from "../utils/reconcileV3SandboxPaymentIsolated.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalSquareEnv = process.env.SQUARE_ENVIRONMENT;

const connection = {
  db: { databaseName: "signavi_shipping_v3_dev" },
  startSession() {
    throw new Error("UNEXPECTED_TRANSACTION_START");
  }
};

const evidence = {
  connection,
  Order: {},
  PaymentOperation: {},
  payment: {
    id: "sandbox-test-payment",
    order_id: "sandbox-test-square-order",
    status: "COMPLETED"
  },
  squareOrder: {
    id: "sandbox-test-square-order"
  },
  expectedLocationId: "sandbox-test-location"
};

test.after(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }

  if (originalSquareEnv === undefined) {
    delete process.env.SQUARE_ENVIRONMENT;
  } else {
    process.env.SQUARE_ENVIRONMENT = originalSquareEnv;
  }
});

test("production runtime cannot reconcile", async () => {
  process.env.NODE_ENV = "production";
  process.env.SQUARE_ENVIRONMENT = "sandbox";

  await assert.rejects(
    reconcileV3SandboxPaymentIsolated(evidence),
    /SANDBOX_RECONCILIATION_FORBIDDEN/
  );
});

test("production Square mode cannot reconcile", async () => {
  process.env.NODE_ENV = "test";
  process.env.SQUARE_ENVIRONMENT = "production";

  await assert.rejects(
    reconcileV3SandboxPaymentIsolated(evidence),
    /SANDBOX_RECONCILIATION_FORBIDDEN/
  );
});

test("normal application database cannot reconcile", async () => {
  process.env.NODE_ENV = "test";
  process.env.SQUARE_ENVIRONMENT = "sandbox";

  await assert.rejects(
    reconcileV3SandboxPaymentIsolated({
      ...evidence,
      connection: {
        ...connection,
        db: { databaseName: "signavi_store" }
      }
    }),
    /SANDBOX_RECONCILIATION_FORBIDDEN/
  );
});

test("uncompleted payment cannot reconcile", async () => {
  process.env.NODE_ENV = "test";
  process.env.SQUARE_ENVIRONMENT = "sandbox";

  await assert.rejects(
    reconcileV3SandboxPaymentIsolated({
      ...evidence,
      payment: {
        ...evidence.payment,
        status: "PENDING"
      }
    }),
    /INVALID_VERIFIED_PAYMENT_EVIDENCE/
  );
});

test("missing payment identity cannot reconcile", async () => {
  process.env.NODE_ENV = "test";
  process.env.SQUARE_ENVIRONMENT = "sandbox";

  await assert.rejects(
    reconcileV3SandboxPaymentIsolated({
      ...evidence,
      payment: {
        ...evidence.payment,
        id: ""
      }
    }),
    /INVALID_VERIFIED_PAYMENT_EVIDENCE/
  );
});

test("both durable claim identities are present", () => {
  const source = readFileSync(
    new URL("../utils/reconcileV3SandboxPaymentIsolated.js", import.meta.url),
    "utf8"
  );

  assert.ok(source.includes("sandbox:payment:${payment.id}"));
  assert.ok(source.includes("sandbox:order:${String(order._id)}"));
  assert.ok(source.includes("session.withTransaction"));
});

test("production webhook reconciliation remains disabled", () => {
  const source = readFileSync(
    new URL("../routes/squareWebhook.js", import.meta.url),
    "utf8"
  );

  assert.ok(
    source.includes(
      "Production V3 payment reconciliation remains disabled"
    )
  );
});

console.log("STEP 750: GUARD TESTS — NO DATABASE OR SQUARE CONNECTIONS");
