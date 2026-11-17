import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCheckoutStorefront
} from "./resolveCheckoutStorefront.js";

import {
  calculateCatalogCart
} from "./catalogPricing.js";

const studioId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const storeId = "bbbbbbbbbbbbbbbbbbbbbbbb";

test("Studio checkout rejects an explicitly Store-labeled item", () => {
  assert.throws(
    () => resolveCheckoutStorefront({
      storefront: "signavi_studio",
      items: [{
        productId: storeId,
        storefront: "signavi_store"
      }]
    }),
    /different storefronts/
  );
});

test("Store checkout rejects an explicitly Studio-labeled item", () => {
  assert.throws(
    () => resolveCheckoutStorefront({
      storefront: "signavi_store",
      items: [{
        productId: studioId,
        storefront: "signavi_studio"
      }]
    }),
    /different storefronts/
  );
});

test("Studio cart rejects a product absent from its selected catalog", () => {
  assert.throws(
    () => calculateCatalogCart(
      [],
      [{ productId: storeId, quantity: 1 }],
      "signavi_studio"
    ),
    /cart product is no longer available/
  );
});

test("Store cart rejects a product absent from its selected catalog", () => {
  assert.throws(
    () => calculateCatalogCart(
      [],
      [{ productId: studioId, quantity: 1 }],
      "signavi_store"
    ),
    /cart product is no longer available/
  );
});

test("A partially resolved cart cannot silently omit missing items", () => {
  const availableProduct = {
    _id: storeId
  };

  assert.throws(
    () => calculateCatalogCart(
      [availableProduct],
      [{ productId: studioId, quantity: 1 }],
      "signavi_store"
    ),
    /cart product is no longer available/
  );
});
