import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";

const secret = randomUUID();

process.env.JWT_SECRET = secret;
process.env.SIGNAVI_PRODUCT_DATABASE_ISOLATION = "true";

const { default: router } =
  await import("./shippingPackingProfiles.js");

const { default: Product } =
  await import("../models/Product.js");

const { getStudioDatabase } =
  await import("../config/studioDatabase.js");

const originalFindOne = Product.findOne;
let legacyLookups = 0;

Product.findOne = () => {
  legacyLookups++;
  throw new Error("LEGACY_PRODUCT_LOOKUP_FORBIDDEN");
};

const productId = "507f1f77bcf86cd799439011";
const packageId = "507f1f77bcf86cd799439012";

const validInput = {
  productId,
  packageId,
  unitWeightOz: 7,
  verifiedCapacity: 3,
  verifiedBy: "Synthetic verifier",
  verifiedAt: "2026-11-01T12:00:00Z",
  verificationNotes: "Synthetic test evidence only"
};

const app = express();
app.use(express.json());
app.use("/profiles", router);

let server;

try {
  server = await new Promise(resolve => {
    const instance = app.listen(0, "127.0.0.1", () => {
      resolve(instance);
    });
  });

  const baseURL =
    `http://127.0.0.1:${server.address().port}/profiles`;

  const token = jwt.sign(
    { id: productId, role: "admin" },
    secret,
    { expiresIn: "5m" }
  );

  test("isolated Studio connection is unavailable", () => {
    assert.throws(
      () => getStudioDatabase(),
      /STUDIO_DATABASE_NOT_CONNECTED/
    );
  });

  test("isolated administrator draft fails closed without Studio DB", async () => {
    const response = await fetch(
      `${baseURL}/validate-draft`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(validInput)
      }
    );

    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.success, false);
    assert.equal(legacyLookups, 0);
  });

  test("isolated administrator cannot create a profile", async () => {
    const response = await fetch(
      `${baseURL}/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(validInput)
      }
    );

    assert.equal(response.status, 503);
    assert.equal(legacyLookups, 0);
  });

} finally {
  after(async () => {
    Product.findOne = originalFindOne;

    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });
}