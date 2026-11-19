import test, { mock, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";

const secret = randomUUID();

process.env.JWT_SECRET = secret;
process.env.SIGNAVI_PRODUCT_DATABASE_ISOLATION = "true";

const productId = "507f1f77bcf86cd799439011";
const packageId = "507f1f77bcf86cd799439012";

const product = {
  _id: productId,
  storefront: "signavi_studio",
  salesChannel: "signavi_studio",
  productType: "physical",
  shipping: {
    mode: "saved_package",
    packageId,
    packagingType: "mailer"
  }
};

const shippingPackage = {
  _id: packageId,
  active: true,
  type: "mailer",
  lengthIn: 14,
  widthIn: 10,
  heightIn: 2,
  tareWeightOz: 1,
  maxWeightOz: 32,
  uspsFlatRate: false
};

const db = {
  name: "signavi_studio",
  readyState: 1
};

let currentProduct = product;
let studioLookups = 0;
let legacyLookups = 0;

const studioModel = {
  modelName: "Product",
  db,
  collection: {
    name: "products",
    conn: db
  },
  findOne(query) {
    studioLookups++;

    assert.deepEqual(query, {
      _id: productId,
      storefront: "signavi_studio",
      salesChannel: "signavi_studio"
    });

    return {
      lean: async () => currentProduct
    };
  }
};

// Mock the Studio model provider before importing the route.
mock.module("../models/productModelSelection.js", {
  exports: {
    getProductModelForChannel(channel) {
      assert.equal(channel, "signavi_studio");
      return studioModel;
    }
  }
});

const { default: router } =
  await import("./shippingPackingProfiles.js");

const { default: Product } =
  await import("../models/Product.js");

const { default: ShippingPackage } =
  await import("../models/ShippingPackage.js");

const originalLegacyFind = Product.findOne;
const originalPackageFind = ShippingPackage.findById;

Product.findOne = () => {
  legacyLookups++;
  throw new Error("LEGACY_PRODUCT_LOOKUP_FORBIDDEN");
};

ShippingPackage.findById = () => ({
  lean: async () => shippingPackage
});

const app = express();
app.use(express.json());
app.use("/profiles", router);

const server = await new Promise(resolve => {
  const instance = app.listen(0, "127.0.0.1", () => {
    resolve(instance);
  });
});

after(async () => {
  Product.findOne = originalLegacyFind;
  ShippingPackage.findById = originalPackageFind;

  await new Promise(resolve => server.close(resolve));
  mock.reset();
});

const token = jwt.sign(
  { id: productId, role: "admin" },
  secret,
  { expiresIn: "5m" }
);

const baseURL =
  `http://127.0.0.1:${server.address().port}/profiles`;

async function request(path = "/validate-draft") {
  const response = await fetch(baseURL + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      productId,
      packageId,
      unitWeightOz: 7,
      verifiedCapacity: 3,
      verifiedBy: "Synthetic verifier",
      verifiedAt: "2026-11-01T12:00:00Z",
      verificationNotes: "Synthetic test evidence only"
    })
  });

  return {
    status: response.status,
    body: await response.json()
  };
}

test("isolated Studio model validates an inactive unsaved draft", async () => {
  const result = await request();

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.storefront, "signavi_studio");
  assert.equal(result.body.saved, false);
  assert.equal(result.body.activated, false);
  assert.equal(result.body.draft.active, false);
  assert.equal(studioLookups, 1);
  assert.equal(legacyLookups, 0);
});

test("isolated Studio lookup rejects a missing Studio product", async () => {
  currentProduct = null;

  try {
    const result = await request();

    assert.equal(result.status, 404);
    assert.equal(legacyLookups, 0);
  } finally {
    currentProduct = product;
  }
});

test("isolated administrator cannot create a packing profile", async () => {
  const result = await request("/");

  assert.equal(result.status, 503);
  assert.equal(legacyLookups, 0);
});