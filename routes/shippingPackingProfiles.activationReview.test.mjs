import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";

import Profile from "../models/ShippingProductPackageProfile.js";
import ShippingPackage from "../models/ShippingPackage.js";
import mongoose from "mongoose";
import {
  connectStudioDatabase
} from "../config/studioDatabase.js";

process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");

const { default: router } =
  await import("./shippingPackingProfiles.js");

const app = express();
app.use("/api/shipping-packing-profiles", router);

const server = createServer(app);

const originalFindById = Profile.findById;
const originalUpdateOne = Profile.updateOne;
const originalFindByIdAndUpdate = Profile.findByIdAndUpdate;
const originalDeleteOne = Profile.deleteOne;

const originalPackageFindById = ShippingPackage.findById;
const primary = mongoose.connection;
const originalState = primary.readyState;
const originalUseDb = primary.useDb;

const studioConnection = {
  name: "signavi_studio",
  readyState: 1,
  models: {},
  db: {
    admin: () => ({
      ping: async () => ({ ok: 1 })
    })
  }
};

const productId = "6afb9c92222951acaeec3db7";
const packageId = "6af181b99f2f2d016a378202";

const studioProduct = {
  _id: productId,
  storefront: "signavi_studio",
  salesChannel: "signavi_studio",
  productType: "physical",
  shipping: {
    mode: "saved_package",
    packageId,
    packagingType: "poly_mailer"
  }
};

const shippingPackage = {
  _id: packageId,
  active: true,
  type: "poly_mailer",
  lengthIn: 14,
  widthIn: 10,
  heightIn: 2,
  maxWeightOz: 32,
  tareWeightOz: 1,
  uspsFlatRate: false
};

studioConnection.models.Product = {
  modelName: "Product",
  db: studioConnection,
  collection: {
    name: "products",
    conn: studioConnection
  },
  findOne: () => ({
    lean: async () => studioProduct
  })
};

ShippingPackage.findById = () => ({
  lean: async () => shippingPackage
});

try {
  primary.readyState = 1;
  primary.useDb = () => studioConnection;
  await connectStudioDatabase();
} finally {
  primary.useDb = originalUseDb;
  primary.readyState = originalState;
}
await new Promise(resolve =>
  server.listen(0, "127.0.0.1", resolve)
);

const port = server.address().port;
const baseUrl =
  `http://127.0.0.1:${port}/api/shipping-packing-profiles`;

const profileId = "507f1f77bcf86cd799439013";

function createToken(role) {
  return jwt.sign(
    {
      id: "507f1f77bcf86cd799439011",
      role
    },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "5m"
    }
  );
}

const adminToken = createToken("admin");
const customerToken = createToken("customer");

function reviewUrl(id = profileId) {
  return `${baseUrl}/${id}/activation-review`;
}

async function request(url, token) {
  return fetch(url, {
    headers: token
      ? { Authorization: `Bearer ${token}` }
      : {}
  });
}

let readCount = 0;
let writeCount = 0;

function mockFindById(result) {
  Profile.findById = () => {
    readCount++;

    return {
      select: () => ({
        lean: async () => {
          if (result instanceof Error) throw result;
          return result;
        }
      })
    };
  };
}

function forbidWrites() {
  const blocked = () => {
    writeCount++;
    throw new Error("DATABASE_WRITE_FORBIDDEN");
  };

  Profile.updateOne = blocked;
  Profile.findByIdAndUpdate = blocked;
  Profile.deleteOne = blocked;
}

const placeholderProfile = {
  _id: profileId,
  productId: "6afb9c92222951acaeec3db7",
  packageId: "6af181b99f2f2d016a378202",
  unitWeightOz: 6,
  verifiedCapacity: 4,
  verifiedBy: "DEVELOPMENT_PLACEHOLDER_NOT_PHYSICALLY_VERIFIED",
  verifiedAt: "2026-11-20",
  verificationNotes: "TEST ONLY. Assumed capacity.",
  active: false
};

try {
  forbidWrites();

  await test("review without JWT returns 401", async () => {
    readCount = 0;

    const response = await request(reviewUrl());

    assert.equal(response.status, 401);
    assert.equal(readCount, 0);
  });

  await test("customer review returns 403", async () => {
    readCount = 0;

    const response = await request(
      reviewUrl(),
      customerToken
    );

    assert.equal(response.status, 403);
    assert.equal(readCount, 0);
  });

  await test("invalid profile ID returns 400", async () => {
    readCount = 0;

    const response = await request(
      reviewUrl("invalid-id"),
      adminToken
    );

    assert.equal(response.status, 400);
    assert.equal(readCount, 0);
  });

  await test("missing profile returns 404", async () => {
    mockFindById(null);

    const response = await request(
      reviewUrl(),
      adminToken
    );

    assert.equal(response.status, 404);
  });

  await test("admin receives review-only assessment", async () => {
    mockFindById(placeholderProfile);

    const response = await request(
      reviewUrl(),
      adminToken
    );

    assert.equal(response.status, 200);

    const body = await response.json();

    assert.equal(body.success, true);
    assert.equal(body.ownershipVerified, true);
    assert.equal(body.assessment.status, "REVIEW_ONLY");

    assert.equal(
      body.assessment.eligibilityReason,
      "PLACEHOLDER_EVIDENCE_REJECTED"
    );

    assert.equal(body.assessment.reviewComplete, false);
    assert.equal(body.assessment.mayActivateProfile, false);
    assert.equal(body.assessment.mayExecutePayment, false);
  });

  await test("Store product ownership is rejected", async () => {
    const originalStorefront = studioProduct.storefront;
    const originalChannel = studioProduct.salesChannel;

    try {
      studioProduct.storefront = "signavi_store";
      studioProduct.salesChannel = "signavi_store";

      const response = await request(reviewUrl(), adminToken);
      const body = await response.json();

      assert.equal(response.status, 422);
      assert.equal(body.ownershipVerified, false);
      assert.equal(
        body.message,
        "Product storefront ownership mismatch"
      );
      assert.equal(body.assessment.mayActivateProfile, false);
    } finally {
      studioProduct.storefront = originalStorefront;
      studioProduct.salesChannel = originalChannel;
    }
  });

  await test("mismatched package is rejected", async () => {
    const originalPackageId = studioProduct.shipping.packageId;

    try {
      studioProduct.shipping.packageId =
        "507f1f77bcf86cd799439099";

      const response = await request(reviewUrl(), adminToken);
      const body = await response.json();

      assert.equal(response.status, 422);
      assert.equal(body.ownershipVerified, false);
      assert.equal(
        body.message,
        "Selected package does not match product"
      );
      assert.equal(body.assessment.mayActivateProfile, false);
    } finally {
      studioProduct.shipping.packageId = originalPackageId;
    }
  });

  await test("inactive shipping package is rejected", async () => {
    const originalActive = shippingPackage.active;

    try {
      shippingPackage.active = false;

      const response = await request(reviewUrl(), adminToken);
      const body = await response.json();

      assert.equal(response.status, 422);
      assert.equal(body.ownershipVerified, false);
      assert.equal(body.message, "Shipping package is inactive");
      assert.equal(body.assessment.mayActivateProfile, false);
    } finally {
      shippingPackage.active = originalActive;
    }
  });

  await test("disconnected Studio database fails closed", async () => {
    const originalReadyState = studioConnection.readyState;

    try {
      studioConnection.readyState = 0;

      const response = await request(reviewUrl(), adminToken);
      const body = await response.json();

      assert.equal(response.status, 500);
      assert.equal(body.success, false);
      assert.equal(
        body.message,
        "Unable to review packing profile"
      );
    } finally {
      studioConnection.readyState = originalReadyState;
    }
  });
  await test("database read failure returns 500", async () => {
    mockFindById(new Error("ISOLATED_READ_FAILURE"));

    const response = await request(
      reviewUrl(),
      adminToken
    );

    assert.equal(response.status, 500);

    const body = await response.json();

    assert.equal(body.success, false);
    assert.equal(
      body.message,
      "Unable to review packing profile"
    );
  });

  await test("review requests perform no model writes", () => {
    assert.equal(writeCount, 0);
  });

} finally {
  ShippingPackage.findById = originalPackageFindById;
  Profile.findById = originalFindById;
  Profile.updateOne = originalUpdateOne;
  Profile.findByIdAndUpdate = originalFindByIdAndUpdate;
  Profile.deleteOne = originalDeleteOne;

  await new Promise((resolve, reject) =>
    server.close(error =>
      error ? reject(error) : resolve()
    )
  );
}
