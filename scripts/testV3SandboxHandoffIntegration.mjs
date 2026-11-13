import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = new URL(
  "../utils/v3TrustedSandboxCheckoutHandoff.js",
  import.meta.url
);

let source = readFileSync(file, "utf8");

// Replace only the three known imports with injected mocks.
// The actual handoff function body remains unchanged.
const importPattern =
  /^import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?[ \t]*(?:\r?\n|$)/gm;

const importMatches = source.match(importPattern) || [];

assert.ok(
  importMatches.length >= 5,
  "Expected current sandbox handoff imports"
);

source = source.replace(importPattern, "");
assert.match(
  source,
  /export async function executeV3TrustedSandboxHandoff/
);

source = source.replace(
  /^export\s+(?=async function )/gm,
  ""
);

const factory = new Function(
  "mongoose",
  "reserveV3VerifiedSandboxRequest",
  "runV3TrustedSandboxExecution",
  "getV3SandboxConnection",
  "assertV3TrustedSandboxFirstPaymentAuthorization",
  `${source}
   return executeV3TrustedSandboxHandoff;`
);

const orderId = "507f1f77bcf86cd799439011";
const owner = "server-owned-test-lock";

const original = {
  NODE_ENV: process.env.NODE_ENV,
  SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT
};

function createHarness(reservationOverrides = {}) {
  const calls = [];

  const mongoose = {
    connection: {
      readyState: 1,
      db: { databaseName: "signavi_shipping_v3_dev" }
    },
    isValidObjectId: value => value === orderId
  };

  const reserve = async args => {
    calls.push("reserve");

    assert.deepEqual(args, { orderId, owner });

    return {
      merchantIdentityVerified: true,
      requestReserved: true,
      environment: "sandbox",
      status: "reconciliation_required",
      squareRequestAuthorized: false,
      paymentCreated: false,
      orderId,
      owner,
      ...reservationOverrides
    };
  };

  const execute = async args => {
    calls.push("execute");
    assert.deepEqual(args, { orderId, owner });

    // No Square SDK is used.
    return {
      status: "mock_execution_complete",
      paymentCreated: false
    };
  };

  return {
    calls,
    run: factory(
      mongoose,
      reserve,
      execute,
      async () => ({
        readyState: 1,
        db: { databaseName: "signavi_shipping_v3_dev" }
      }),
      () => {
        calls.push("authorize")
      }
    )
  };
}

process.env.NODE_ENV = "development";
process.env.SQUARE_ENVIRONMENT = "sandbox";

try {
  test("denied authorization blocks reservation and execution", async () => {
    const calls = []

    const run = factory(
      {
        isValidObjectId: value => value === orderId
      },
      async () => {
        calls.push("reserve")
        throw new Error("RESERVATION_MUST_NOT_RUN")
      },
      async () => {
        calls.push("execute")
        throw new Error("EXECUTION_MUST_NOT_RUN")
      },
      async () => ({
        readyState: 1,
        db: { databaseName: "signavi_shipping_v3_dev" }
      }),
      () => {
        calls.push("authorize")
        throw new Error(
          "V3_TRUSTED_FIRST_PAYMENT_AUTHORIZATION_NOT_CONNECTED"
        )
      }
    )

    await assert.rejects(
      run({ orderId, owner }),
      /V3_TRUSTED_FIRST_PAYMENT_AUTHORIZATION_NOT_CONNECTED/
    )

    assert.deepEqual(calls, ["authorize"])
  })
  test("valid reservation reaches executor once", async () => {
    const h = createHarness();

    const result = await h.run({ orderId, owner });

    assert.deepEqual(h.calls, ["authorize", "reserve", "execute"]);
    assert.equal(result.status, "mock_execution_complete");
  });

  test("unverified merchant blocks execution", async () => {
    const h = createHarness({
      merchantIdentityVerified: false
    });

    await assert.rejects(
      h.run({ orderId, owner }),
      /RESERVATION_REJECTED/
    );

    assert.deepEqual(h.calls, ["authorize", "reserve"]);
  });

  test("wrong reservation owner blocks execution", async () => {
    const h = createHarness({
      owner: "different-owner"
    });

    await assert.rejects(
      h.run({ orderId, owner }),
      /RESERVATION_REJECTED/
    );

    assert.deepEqual(h.calls, ["authorize", "reserve"]);
  });

  test("unauthorized reservation blocks execution", async () => {
    const h = createHarness({
      requestReserved: false
    });

    await assert.rejects(
      h.run({ orderId, owner }),
      /RESERVATION_REJECTED/
    );

    assert.deepEqual(h.calls, ["authorize", "reserve"]);
  });
} finally {
  // Test execution happens after registration.
}

process.on("exit", () => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
