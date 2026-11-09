import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3SandboxOwnershipEvidence
} from "../utils/assessV3SandboxOwnershipEvidence.js";

const orderId = "507f1f77bcf86cd799439011";

const input = overrides => ({
  orderId,
  storefront: {
    databaseName: "signavi_store",
    order: { _id: orderId },
    operation: null
  },
  sandbox: {
    databaseName: "signavi_shipping_v3_dev",
    purchase: null,
    operation: null
  },
  ...overrides
});

test("consistent snapshot never grants ownership", () => {
  const result = assessV3SandboxOwnershipEvidence(input());

  assert.equal(result.complete, true);
  assert.equal(result.exclusive, false);
  assert.equal(result.durable, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("incorrect database boundary fails closed", () => {
  const result = assessV3SandboxOwnershipEvidence(input({
    sandbox: {
      databaseName: "signavi_store",
      purchase: null,
      operation: null
    }
  }));

  assert.equal(result.complete, false);
  assert.equal(result.reason, "DATABASE_BOUNDARY_UNVERIFIED");
});

test("storefront order mismatch is rejected", () => {
  const result = assessV3SandboxOwnershipEvidence(input({
    storefront: {
      databaseName: "signavi_store",
      order: { _id: "607f1f77bcf86cd799439011" }
    }
  }));

  assert.equal(result.complete, false);
  assert.equal(
    result.reason,
    "STOREFRONT_ORDER_IDENTITY_MISMATCH"
  );
});

test("existing sandbox purchase claim is not reusable", () => {
  const result = assessV3SandboxOwnershipEvidence(input({
    sandbox: {
      databaseName: "signavi_shipping_v3_dev",
      purchase: {
        environment: "sandbox",
        purchaseKey: `order:${orderId}`
      },
      operation: null
    }
  }));

  assert.equal(result.complete, false);
  assert.equal(result.reason, "EXISTING_SANDBOX_PURCHASE_CLAIM");
});

test("existing payment operation is rejected", () => {
  const result = assessV3SandboxOwnershipEvidence(input({
    sandbox: {
      databaseName: "signavi_shipping_v3_dev",
      purchase: null,
      operation: { status: "reconciliation_required" }
    }
  }));

  assert.equal(result.complete, false);
  assert.equal(
    result.reason,
    "EXISTING_SANDBOX_PAYMENT_OPERATION"
  );
});

test("conflicting purchase identity is rejected", () => {
  const result = assessV3SandboxOwnershipEvidence(input({
    sandbox: {
      databaseName: "signavi_shipping_v3_dev",
      purchase: {
        environment: "sandbox",
        purchaseKey: "order:wrong"
      },
      operation: null
    }
  }));

  assert.equal(result.complete, false);
  assert.equal(
    result.reason,
    "SANDBOX_PURCHASE_IDENTITY_CONFLICT"
  );
});