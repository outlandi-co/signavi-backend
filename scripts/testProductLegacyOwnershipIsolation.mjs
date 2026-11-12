import test from "node:test";
import assert from "node:assert/strict";

import { resolveProductIdQuery } from
  "../services/resolveProductIdQuery.js";

import { assertProductChannelUpdate } from
  "../services/assertProductChannelUpdate.js";

const id = "507f1f77bcf86cd799439011";

const studioRequest = {
  query: { storefront: "signavi_studio" },
  body: {}
};

const studioProduct = {
  _id: id,
  storefront: "signavi_studio",
  salesChannel: "signavi_studio"
};

const storeProduct = {
  _id: id,
  storefront: "signavi_store",
  salesChannel: "signavi_store"
};

for (const enabled of [false, true]) {
  const mode = enabled ? "isolated" : "legacy";

  test(`${mode}: deletion scoped to storefront`, () => {
    assert.deepEqual(
      resolveProductIdQuery(studioRequest, id, { enabled }),
      {
        _id: id,
        storefront: "signavi_studio",
        salesChannel: "signavi_studio"
      }
    );
  });

  test(`${mode}: cross-storefront update rejected`, () => {
    assert.throws(
      () => assertProductChannelUpdate({
        req: studioRequest,
        existingProduct: storeProduct,
        updates: { name: "Changed" },
        enabled
      }),
      /EXISTING_PRODUCT_CHANNEL_MISMATCH/
    );
  });

  test(`${mode}: same-storefront update permitted`, () => {
    assert.equal(
      assertProductChannelUpdate({
        req: studioRequest,
        existingProduct: studioProduct,
        updates: { name: "Changed" },
        enabled
      }),
      true
    );
  });

  test(`${mode}: ownership change forbidden`, () => {
    assert.throws(
      () => assertProductChannelUpdate({
        req: studioRequest,
        existingProduct: studioProduct,
        updates: { salesChannel: "signavi_store" },
        enabled
      }),
      /PRODUCT_CHANNEL_CHANGE_FORBIDDEN/
    );
  });

  test(`${mode}: missing channel rejected`, () => {
    assert.throws(
      () => resolveProductIdQuery(
        { query: {}, body: {} },
        id,
        { enabled }
      ),
      /PRODUCT_CHANNEL_REQUIRED_OR_CONFLICTING/
    );
  });

  test(`${mode}: conflicting channels rejected`, () => {
    assert.throws(
      () => resolveProductIdQuery(
        {
          query: { storefront: "signavi_studio" },
          body: { salesChannel: "signavi_store" }
        },
        id,
        { enabled }
      ),
      /PRODUCT_CHANNEL_REQUIRED_OR_CONFLICTING/
    );
  });

  test(`${mode}: update operators rejected`, () => {
    assert.throws(
      () => assertProductChannelUpdate({
        req: studioRequest,
        existingProduct: studioProduct,
        updates: { $set: { name: "Changed" } },
        enabled
      }),
      /PRODUCT_UPDATE_OPERATOR_FORBIDDEN/
    );
  });
}
