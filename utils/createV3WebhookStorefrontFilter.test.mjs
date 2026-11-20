import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  createV3WebhookStorefrontFilter
} from "./createV3WebhookStorefrontFilter.js";

test("Verified Store ownership produces atomic filter", () => {
  const result = createV3WebhookStorefrontFilter({
    storefront: "signavi_store"
  });

  assert.deepEqual(result, {
    storefront: "signavi_store"
  });

  assert.equal(Object.isFrozen(result), true);
});

for (const storefront of [
  "signavi_studio",
  undefined,
  null,
  "",
  "unknown"
]) {
  test(`V3 webhook rejects storefront: ${String(storefront)}`, () => {
    assert.throws(
      () => createV3WebhookStorefrontFilter({ storefront }),
      /V3 webhook storefront ownership mismatch/
    );
  });
}

test("V3 webhook rejects missing order", () => {
  assert.throws(
    () => createV3WebhookStorefrontFilter(null),
    /V3 webhook storefront ownership mismatch/
  );
});

test("Active webhook uses V3 filter in atomic update", () => {
  const source = fs.readFileSync(
    new URL("../routes/squareWebhook.js", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /verifiedV3StorefrontFilter\s*=\s*createV3WebhookStorefrontFilter\(order\)/
  );

  assert.match(
    source,
    /\.\.\.\(verifiedV3StorefrontFilter \|\| \{\}\)/
  );
});
