import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeProductStorefront,
  createProductStorefrontScope,
  matchesProductStorefront
} from "./productStorefrontScope.mjs";

const admin = { id: "test-admin", role: "admin" };
const customer = { id: "test-customer", role: "customer" };
const id = "507f1f77bcf86cd799439011";

test("Store channel is accepted", () => {
  assert.equal(
    normalizeProductStorefront("signavi_store"),
    "signavi_store"
  );
});

test("Studio channel is accepted", () => {
  assert.equal(
    normalizeProductStorefront("signavi_studio"),
    "signavi_studio"
  );
});

test("Legacy ambiguous channel is rejected", () => {
  assert.equal(normalizeProductStorefront("signavi"), null);
});

test("Missing channel is rejected", () => {
  const result = createProductStorefrontScope({
    user: admin,
    productId: id
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test("Customer cannot obtain admin product scope", () => {
  const result = createProductStorefrontScope({
    user: customer,
    storefront: "signavi_store",
    productId: id
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("Store scope includes database ownership filter", () => {
  const result = createProductStorefrontScope({
    user: admin,
    storefront: "signavi_store",
    productId: id
  });

  assert.equal(result.ok, true);

  assert.deepEqual(result.filter, {
    _id: id,
    storefront: "signavi_store"
  });
});

test("Studio scope includes database ownership filter", () => {
  const result = createProductStorefrontScope({
    user: admin,
    storefront: "signavi_studio",
    productId: id
  });

  assert.equal(result.ok, true);

  assert.deepEqual(result.filter, {
    _id: id,
    storefront: "signavi_studio"
  });
});

test("Store operation rejects Studio product", () => {
  assert.equal(
    matchesProductStorefront(
      {
        storefront: "signavi_studio",
        salesChannel: "signavi_studio"
      },
      "signavi_store"
    ),
    false
  );
});

test("Inconsistent stored channel is rejected", () => {
  assert.equal(
    matchesProductStorefront(
      {
        storefront: "signavi_store",
        salesChannel: "signavi_studio"
      },
      "signavi_store"
    ),
    false
  );
});

test("Matching Store product is accepted", () => {
  assert.equal(
    matchesProductStorefront(
      {
        storefront: "signavi_store",
        salesChannel: "signavi_store"
      },
      "signavi_store"
    ),
    true
  );
});

test("Malformed product ID is rejected", () => {
  const result = createProductStorefrontScope({
    user: admin,
    storefront: "signavi_store",
    productId: "invalid"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});
