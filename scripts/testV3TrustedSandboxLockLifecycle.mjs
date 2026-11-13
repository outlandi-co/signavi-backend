import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../utils/v3TrustedSandboxCheckoutHandoff.js", import.meta.url),
  "utf8"
);

const marker = "export async function executeV3TrustedSandboxCheckout(";
const start = source.indexOf(marker);

assert.ok(start >= 0, "Trusted checkout entry point missing");

const functionSource = source.slice(start).replace(/^export /, "");

const dependencies = [
  "mongoose",
  "Order",
  "prepareV3CheckoutPayment",
  "getV3SandboxConnection",
  "getV3SandboxModels",
  "acquireV3IsolatedCheckoutLock",
  "executeV3TrustedSandboxHandoff",
  "releaseV3IsolatedCheckoutLock"
];

const loadFunction = values =>
  new Function(
    ...dependencies,
    `${functionSource}
return executeV3TrustedSandboxCheckout;`
  )(...values);

const id = "507f1f77bcf86cd799439011";

async function runScenario({ failure = false, expired = false } = {}) {
  const calls = [];
  const storefront = {
    readyState: 1,
    db: { databaseName: "signavi_store" }
  };
  const sandbox = {
    readyState: 1,
    db: { databaseName: "signavi_shipping_v3_dev" }
  };
  const CheckoutLock = { db: sandbox };
  const order = { squareExpectedAmountCents: 1234 };
  const lock = {
    owner: "test-owner",
    orderId: id,
    expiresAt: new Date(Date.now() + (expired ? -60000 : 60000))
  };

  const mongoose = {
    connection: storefront,
    isValidObjectId: value => value === id
  };

  const Order = {
    db: storefront,
    findById: async () => order
  };

  const execute = loadFunction([
    mongoose,
    Order,
    () => ({ orderId: id, totalCents: 1234 }),
    async () => sandbox,
    () => ({ CheckoutLock }),
    async () => {
      calls.push("acquire");
      return lock;
    },
    async ({ orderId, owner }) => {
      calls.push("handoff");
      assert.equal(orderId, id);
      assert.equal(owner, lock.owner);
      if (failure) throw new Error("SIMULATED_HANDOFF_FAILURE");
      return { success: true };
    },
    async (releasedLock, options) => {
      calls.push("release");
      assert.equal(releasedLock, lock);
      assert.equal(options.CheckoutLock, CheckoutLock);
      return true;
    }
  ]);

  const previousNode = process.env.NODE_ENV;
  const previousSquare = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.NODE_ENV = "test";
    process.env.SQUARE_ENVIRONMENT = "sandbox";

    if (expired) {
      await assert.rejects(
        execute({
          orderId: id,
          guestToken: "test-token",
          signedQuote: "test-quote"
        }),
        /V3_SANDBOX_CHECKOUT_LOCK_REJECTED/
      );
      assert.deepEqual(calls, ["acquire", "release"]);
    } else if (failure) {
      await assert.rejects(
        execute({
          orderId: id,
          guestToken: "test-token",
          signedQuote: "test-quote"
        }),
        /SIMULATED_HANDOFF_FAILURE/
      );
      assert.deepEqual(calls, ["acquire", "handoff", "release"]);
    } else {
      const result = await execute({
        orderId: id,
        guestToken: "test-token",
        signedQuote: "test-quote"
      });

      assert.equal(result.success, true);
      assert.deepEqual(calls, ["acquire", "handoff", "release"]);
    }
  } finally {
    if (previousNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNode;

    if (previousSquare === undefined) delete process.env.SQUARE_ENVIRONMENT;
    else process.env.SQUARE_ENVIRONMENT = previousSquare;
  }
}

test("successful handoff releases checkout lock", async () => {
  await runScenario();
});

test("failed handoff releases checkout lock", async () => {
  await runScenario({ failure: true });
});

test("expired lock is rejected and cleanup runs", async () => {
  await runScenario({ expired: true });
});