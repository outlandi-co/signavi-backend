import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

// An isolated signing secret; never load production credentials.
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");

const { default: router } =
  await import("./shippingPackingProfiles.js");

const app = express();
app.use(express.json());
app.use("/api/shipping-packing-profiles", router);

const server = createServer(app);

await new Promise(resolve => {
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();
const base = `http://127.0.0.1:${address.port}`;
const endpoint = `${base}/api/shipping-packing-profiles`;

function token(role) {
  return jwt.sign(
    {
      id: "507f1f77bcf86cd799439011",
      role,
      email: "test@example.invalid"
    },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "5m"
    }
  );
}

try {
  await test("GET without JWT returns 401", async () => {
    const response = await fetch(endpoint);
    assert.equal(response.status, 401);
  });

  await test("Customer GET returns 403", async () => {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token("customer")}`
      }
    });

    assert.equal(response.status, 403);
  });

  await test("Customer POST returns 403", async () => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token("customer")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    assert.equal(response.status, 403);
  });

  await test("Admin POST remains disabled", async () => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token("admin")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    assert.equal(response.status, 503);
  });

  await test("Invalid JWT returns 401", async () => {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: "Bearer invalid.token.value"
      }
    });

    assert.equal(response.status, 401);
  });
} finally {
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}
