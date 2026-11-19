import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";

const secret = randomUUID();
process.env.JWT_SECRET = secret;
process.env.SIGNAVI_PRODUCT_DATABASE_ISOLATION = "false";

const { default: router } =
  await import("./shippingPackingProfiles.js");

const { default: Product } =
  await import("../models/Product.js");

const { default: ShippingPackage } =
  await import("../models/ShippingPackage.js");

const originalProductFindOne = Product.findOne;
const originalPackageFind = ShippingPackage.findById;

const productId = "507f1f77bcf86cd799439011";
const packageId = "507f1f77bcf86cd799439012";

const validInput = {
  productId,
  packageId,
  unitWeightOz: 7,
  verifiedCapacity: 3,
  verifiedBy: "Test verifier",
  verifiedAt: "2026-11-01T12:00:00Z",
  verificationNotes: "Synthetic test evidence only"
};

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

let currentProduct = product;
let currentPackage = shippingPackage;
let simulateFailure = false;
let server;
let baseURL;

Product.findOne = (query) => {
  assert.deepEqual(query, {
    _id: productId,
    storefront: "signavi_studio",
    salesChannel: "signavi_studio"
  });
  return ({
  lean: async () => {
    if (simulateFailure) {
      throw new Error("Synthetic database failure");
    }
    return currentProduct;
  }
  });
};

ShippingPackage.findById = () => ({
  lean: async () => currentPackage
});

const token = role => jwt.sign(
  { id: productId, role },
  secret,
  { expiresIn: "5m" }
);

async function request(body, role = "admin", path = "/validate-draft") {
  const response = await fetch(baseURL + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(role ? {
        Authorization: "Bearer " + token(role)
      } : {})
    },
    body: JSON.stringify(body)
  });

  return {
    status: response.status,
    body: await response.json()
  };
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/profiles", router);

  server = await new Promise(resolve => {
    const instance = app.listen(0, "127.0.0.1", () => {
      resolve(instance);
    });
  });

  baseURL = "http://127.0.0.1:" +
    server.address().port + "/profiles";
});

after(async () => {
  Product.findOne = originalProductFindOne;
  ShippingPackage.findById = originalPackageFind;

  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
});

test("unauthenticated draft request is rejected", async () => {
  const result = await request(validInput, null);
  assert.equal(result.status, 401);
});

test("customer cannot validate a draft", async () => {
  const result = await request(validInput, "customer");
  assert.equal(result.status, 403);
});

test("administrator receives an inactive unsaved draft", async () => {
  const result = await request(validInput);

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.saved, false);
  assert.equal(result.body.activated, false);
  assert.equal(result.body.draft.active, false);
});

test("invalid verification evidence is rejected", async () => {
  const result = await request({
    ...validInput,
    verificationNotes: ""
  });

  assert.equal(result.status, 400);
});

test("overweight packing capacity is rejected", async () => {
  const result = await request({
    ...validInput,
    verifiedCapacity: 5
  });

  assert.equal(result.status, 422);
});

test("missing product is rejected", async () => {
  currentProduct = null;

  try {
    const result = await request(validInput);
    assert.equal(result.status, 404);
  } finally {
    currentProduct = product;
  }
});

test("database read failure returns HTTP 500", async () => {
  simulateFailure = true;

  try {
    const result = await request(validInput);
    assert.equal(result.status, 500);
  } finally {
    simulateFailure = false;
  }
});

test("profile creation remains disabled", async () => {
  const result = await request(validInput, "admin", "/");
  assert.equal(result.status, 503);
});
