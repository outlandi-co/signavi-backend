import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  coordinateV3SandboxTrustedHistoryPreflight
} from "../utils/coordinateV3SandboxTrustedHistoryPreflight.js";

const orderId = "507f1f77bcf86cd799439011";

function assertLocked(result) {
  assert.equal(result.ready, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(Object.isFrozen(result), true);
}

test("invalid order identity rejects without history lookup", async () => {
  const result =
    await coordinateV3SandboxTrustedHistoryPreflight({
      orderId: "invalid"
    });

  assert.equal(result.reason, "INVALID_ORDER_ID");
  assertLocked(result);
});

test("missing order identity rejects", async () => {
  const result =
    await coordinateV3SandboxTrustedHistoryPreflight();

  assert.equal(result.reason, "INVALID_ORDER_ID");
  assertLocked(result);
});

test("production configuration disables history preflight", async () => {
  const previousNode = process.env.NODE_ENV;
  const previousSquare = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.NODE_ENV = "production";
    process.env.SQUARE_ENVIRONMENT = "production";

    const result =
      await coordinateV3SandboxTrustedHistoryPreflight({
        orderId
      });

    assert.equal(
      result.reason,
      "SANDBOX_HISTORY_PREFLIGHT_DISABLED"
    );
    assertLocked(result);
  } finally {
    if (previousNode === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNode;
    }

    if (previousSquare === undefined) {
      delete process.env.SQUARE_ENVIRONMENT;
    } else {
      process.env.SQUARE_ENVIRONMENT = previousSquare;
    }
  }
});

test("caller cannot inject history or reader callbacks", async () => {
  let called = false;

  const result =
    await coordinateV3SandboxTrustedHistoryPreflight({
      orderId: "invalid",
      inspection: {
        inspected: true,
        authoritativeNoPriorActivity: true
      },
      testReaders: {
        readPayments: async () => {
          called = true;
        }
      }
    });

  assert.equal(called, false);
  assertLocked(result);
});

test("coordinator retains explicit non-authorization boundary", () => {
  const source = fs.readFileSync(
    new URL(
      "../utils/coordinateV3SandboxTrustedHistoryPreflight.js",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(
    source,
    /TRUSTED_HISTORY_AUTHORITY_NOT_CONNECTED/
  );

  assert.match(
    source,
    /inspectV3SandboxExternalHistory\(\{\s*orderId: id\s*\}\)/
  );

  assert.doesNotMatch(source, /squareRequestAuthorized:\s*true/);
  assert.doesNotMatch(source, /initializationAuthorized:\s*true/);
});