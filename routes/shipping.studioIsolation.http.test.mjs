import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import axios from "axios";

process.env.NODE_ENV = "test";
process.env.SIGNAVI_PRODUCT_DATABASE_ISOLATION = "true";
process.env.SIGNAVI_SHIPPING_PROFILE_ISOLATION = "true";
process.env.SHIPPO_CUSTOMER_RATE_MODE = "off";
process.env.SHIPPO_API_KEY = "shippo_test_synthetic_never_used";

Object.assign(process.env, {
  SHIP_FROM_NAME: "Test Sender",
  SHIP_FROM_STREET1: "100 Test Street",
  SHIP_FROM_CITY: "Example City",
  SHIP_FROM_STATE: "CA",
  SHIP_FROM_ZIP: "90000",
  SHIP_FROM_COUNTRY: "US"
});

const productId = "507f1f77bcf86cd799439011";
const packageId = "507f1f77bcf86cd799439012";

const studioDb = {
  name: "signavi_studio",
  readyState: 1
};

let studioProductQueries = 0;
let studioProfileQueries = 0;
let legacyQueries = 0;
let shippoCalls = 0;

const studioProductModel = {
  modelName: "Product",
  db: studioDb,
  collection: {
    name: "products",
    conn: studioDb
  },
  find(filter) {
    studioProductQueries++;

    assert.equal(filter.storefront, "signavi_studio");

    return {
      select() {
        return this;
      },
      async lean() {
        return [{
          _id: productId,
          storefront: "signavi_studio",
          salesChannel: "signavi_studio",
          productType: "physical",
          active: true,
          storefrontVisible: true,
          shipping: {
            mode: "saved_package",
            packageId,
            packagingType: "box",
            shipSeparately: false
          }
        }];
      }
    };
  }
};

const studioProfileModel = {
  modelName: "ShippingProductPackageProfile",
  db: studioDb,
  collection: {
    name: "shippingproductpackageprofiles",
    conn: studioDb
  },
  find(filter) {
    studioProfileQueries++;

    assert.equal(String(filter.packageId), packageId);
    assert.equal(filter.active, true);

    // An inactive profile must not appear in active queries.
    return {
      select() {
        return this;
      },
      async lean() {
        return [];
      }
    };
  }
};

// Install isolated model providers before importing the route.
mock.module("../models/productModelSelection.js", {
  exports: {
    getProductModelForChannel(channel) {
      assert.equal(channel, "signavi_studio");
      return studioProductModel;
    }
  }
});

mock.module("../models/ShippingProfileForChannel.js", {
  exports: {
    getShippingProfileModelForChannel(channel) {
      assert.equal(channel, "signavi_studio");
      return studioProfileModel;
    }
  }
});

const { default: shippingRouter } =
  await import("./shipping.js");

const { default: Product } =
  await import("../models/Product.js");

const { default: Profile } =
  await import("../models/ShippingProductPackageProfile.js");

const { default: ShippingPackage } =
  await import("../models/ShippingPackage.js");

// Any fallback to the shared models fails the test.
mock.method(Product, "find", () => {
  legacyQueries++;
  throw new Error("LEGACY_PRODUCT_QUERY_FORBIDDEN");
});

mock.method(Profile, "find", () => {
  legacyQueries++;
  throw new Error("LEGACY_PROFILE_QUERY_FORBIDDEN");
});

mock.method(ShippingPackage, "find", filter => {
  assert.equal(filter.active, true);

  return {
    async lean() {
      return [{
        _id: packageId,
        name: "Synthetic Studio Box",
        carrier: "Generic",
        type: "box",
        lengthIn: 12,
        widthIn: 10,
        heightIn: 4,
        tareWeightOz: 2,
        maxWeightOz: 50,
        clearanceIn: 0.5,
        uspsFlatRate: false,
        active: true
      }];
    }
  };
});

mock.method(axios, "post", async () => {
  shippoCalls++;
  throw new Error("SHIPPO_MUST_NOT_BE_CALLED");
});

const app = express();
app.use(express.json());
app.use("/api/shipping", shippingRouter);

const server = await new Promise(resolve => {
  const instance = app.listen(0, "127.0.0.1", () =>
    resolve(instance)
  );
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  mock.restoreAll();
  mock.reset();
});

test("isolated Studio rejects inactive profile without Shippo", async () => {
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/shipping/get-rates`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        storefront: "signavi_studio",
        items: [{
          productId,
          quantity: 5
        }],
        address_to: {
          name: "Test Recipient",
          street1: "123 Test Street",
          city: "Example City",
          state: "CA",
          zip: "90000",
          country: "US"
        }
      })
    }
  );

  const body = await response.json();

  assert.equal(response.status, 422, JSON.stringify(body));
  assert.equal(body.success, false);

  assert.match(
    body.message,
    /unique active verified packing profile is required/i
  );

  assert.equal(studioProductQueries, 1);
  assert.equal(studioProfileQueries, 1);
  assert.equal(legacyQueries, 0);
  assert.equal(shippoCalls, 0);

  console.log("ISOLATED_STUDIO_PRODUCT_QUERY_VERIFIED");
  console.log("ISOLATED_STUDIO_PROFILE_QUERY_VERIFIED");
  console.log("LEGACY_DATABASE_FALLBACK_ZERO");
  console.log("INACTIVE_PROFILE_HTTP_422_VERIFIED");
  console.log("SHIPPO_REQUEST_COUNT_ZERO");
});
