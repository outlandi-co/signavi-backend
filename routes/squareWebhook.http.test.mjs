import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer } from "node:http";
import express from "express";

const previousEnvironment = {
  SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT,
  SQUARE_WEBHOOK_SIGNATURE_KEY:
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY,
  SQUARE_WEBHOOK_URL: process.env.SQUARE_WEBHOOK_URL
};

const signatureKey = crypto.randomBytes(32).toString("hex");

const notificationUrl =
  "http://127.0.0.1/signavi-synthetic-square-webhook";

process.env.SQUARE_ENVIRONMENT = "sandbox";
process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = signatureKey;
process.env.SQUARE_WEBHOOK_URL = notificationUrl;

// Import after configuring the isolated Square environment.
const { default: webhookRouter } =
  await import("./squareWebhook.js");

const app = express();

// Square signature verification requires the original bytes.
app.use("/api/square", express.raw({
  type: "application/json"
}));

app.use("/api/square", webhookRouter);

const server = createServer(app);

function signBody(rawBody) {
  return crypto
    .createHmac("sha256", signatureKey)
    .update(notificationUrl, "utf8")
    .update(rawBody)
    .digest("base64");
}

async function sendWebhook(base, rawBody, signature) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (signature !== undefined) {
    headers["x-square-hmacsha256-signature"] = signature;
  }

  return fetch(`${base}/api/square/webhook`, {
    method: "POST",
    headers,
    body: rawBody
  });
}

async function startServer() {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  return `http://127.0.0.1:${server.address().port}`;
}

function restoreEnvironment(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

let started = false;

try {
  const base = await startServer();
  started = true;

  await test("Webhook rejects missing signature with HTTP 401", async () => {
    const raw = JSON.stringify({
      type: "payment.updated"
    });

    const response = await sendWebhook(base, raw);

    assert.equal(response.status, 401);
  });

  await test("Webhook rejects incorrect signature with HTTP 401", async () => {
    const raw = JSON.stringify({
      type: "payment.updated"
    });

    const invalidSignature = crypto
      .randomBytes(32)
      .toString("base64");

    const response = await sendWebhook(
      base,
      raw,
      invalidSignature
    );

    assert.equal(response.status, 401);
  });

  await test("Valid signature with malformed JSON returns HTTP 400", async () => {
    const raw = '{"type":';

    const response = await sendWebhook(
      base,
      raw,
      signBody(raw)
    );

    assert.equal(response.status, 400);
  });

  await test("Signed unrelated event returns HTTP 200", async () => {
    const raw = JSON.stringify({
      type: "inventory.count.updated",
      data: {}
    });

    const response = await sendWebhook(
      base,
      raw,
      signBody(raw)
    );

    assert.equal(response.status, 200);
  });

  await test("Signed pending payment returns HTTP 200 without reconciliation", async () => {
    const raw = JSON.stringify({
      type: "payment.updated",
      data: {
        object: {
          payment: {
            id: "synthetic-payment-001",
            status: "PENDING"
          }
        }
      }
    });

    const response = await sendWebhook(
      base,
      raw,
      signBody(raw)
    );

    assert.equal(response.status, 200);
  });
} finally {
  if (started) {
    await new Promise((resolve, reject) => {
      server.close(error =>
        error ? reject(error) : resolve()
      );
    });
  }

  for (const [name, value] of Object.entries(previousEnvironment)) {
    restoreEnvironment(name, value);
  }
}
