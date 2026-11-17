import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import Profile from "../models/ShippingProductPackageProfile.js";

process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");

const { default: router } =
  await import("./shippingPackingProfiles.js");

const app = express();
app.use("/api/shipping-packing-profiles", router);

const server = createServer(app);
const originalFind = Profile.find;

await new Promise(resolve =>
  server.listen(0, "127.0.0.1", resolve)
);

const port = server.address().port;
const url = `http://127.0.0.1:${port}/api/shipping-packing-profiles`;

const token = jwt.sign(
  {
    id: "507f1f77bcf86cd799439011",
    role: "admin"
  },
  process.env.JWT_SECRET,
  {
    algorithm: "HS256",
    expiresIn: "5m"
  }
);

function mockFind(result) {
  Profile.find = () => ({
    select: () => ({
      sort: () => ({
        lean: async () => {
          if (result instanceof Error) throw result;
          return result;
        }
      })
    })
  });
}

try {
  await test("Administrator GET returns profiles", async () => {
    mockFind([
      {
        productId: "507f1f77bcf86cd799439011",
        packageId: "507f1f77bcf86cd799439012",
        active: false
      }
    ]);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.count, 1);
    assert.equal(body.data[0].active, false);
  });

  await test("Administrator GET handles database failure", async () => {
    mockFind(new Error("ISOLATED_TEST_DATABASE_FAILURE"));

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    assert.equal(response.status, 500);

    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(
      body.message,
      "Unable to retrieve packing profiles"
    );
  });
} finally {
  Profile.find = originalFind;

  await new Promise((resolve, reject) =>
    server.close(error =>
      error ? reject(error) : resolve()
    )
  );
}
