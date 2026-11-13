import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("routes/products.js", "utf8");

const updateStart = source.indexOf('router.patch("/:id",');
const deleteStart = source.indexOf('router.delete("/:id"', updateStart);

assert.ok(updateStart >= 0, "Update route must exist");
assert.ok(deleteStart > updateStart, "Delete route must exist");

const updateRoute = source.slice(updateStart, deleteStart);

test("Product update requires admin authentication", () => {
  assert.match(
    updateRoute,
    /requireAuth,\s*requireAdmin/
  );
});

test("Ownership validation runs before upload processing", () => {
  const guardIndex = updateRoute.indexOf(
    "Product ownership is immutable"
  );

  const uploadIndex = updateRoute.indexOf(
    "collectProductUploads("
  );

  assert.ok(guardIndex >= 0);
  assert.ok(uploadIndex > guardIndex);
});

test("Invalid product channel is rejected", () => {
  assert.match(
    updateRoute,
    /Product channel requires administrative reconciliation/
  );
});

test("Ownership changes are rejected", () => {
  assert.match(
    updateRoute,
    /Product ownership cannot be changed through this editor/
  );
});

test("Ordinary edits do not assign new ownership", () => {
  assert.doesNotMatch(
    updateRoute,
    /updates\.storefront\s*=/
  );

  assert.doesNotMatch(
    updateRoute,
    /updates\.salesChannel\s*=/
  );
});

test("Storefront values are validated", () => {
  assert.match(
    updateRoute,
    /normalizeStorefront\(req\.body\[field\]\)/
  );
});

console.log("PRODUCT OWNERSHIP SOURCE TESTS READY");
