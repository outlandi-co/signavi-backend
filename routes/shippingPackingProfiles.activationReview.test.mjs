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

const originalFindById = Profile.findById;
const originalUpdateOne = Profile.updateOne;
const originalFindByIdAndUpdate = Profile.findByIdAndUpdate;
const originalDeleteOne = Profile.deleteOne;

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
    assert.equal(body.ownershipVerified, false);
    assert.equal(body.assessment.status, "REVIEW_ONLY");

    assert.equal(
      body.assessment.eligibilityReason,
      "PLACEHOLDER_EVIDENCE_REJECTED"
    );

    assert.equal(body.assessment.reviewComplete, false);
    assert.equal(body.assessment.mayActivateProfile, false);
    assert.equal(body.assessment.mayExecutePayment, false);
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
