import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createV3ServerOwnedSdkFiveSourceDiagnosticReview
} from "../utils/createV3ServerOwnedSdkFiveSourceDiagnosticReview.js";

const source = readFileSync(
  new URL(
    "../utils/createV3ServerOwnedSdkFiveSourceDiagnosticReview.js",
    import.meta.url
  ),
  "utf8"
);

test("five-source factory accepts no reader configuration", () => {
  assert.equal(
    createV3ServerOwnedSdkFiveSourceDiagnosticReview.length,
    0
  );
});

test("all five readers are constructed internally", () => {
  for (const marker of [
    "createV3ServerOwnedLocalEvidenceReaders()",
    "createV3ServerOwnedSandboxPaymentLinkEvidenceReader()",
    "createV3SandboxOrderHistoryReader()",
    "createV3SandboxPaymentEvidenceReader()",
    "createV3ServerBoundFirstPaymentReview({"
  ]) {
    assert.ok(source.includes(marker), marker);
  }
});

test("composition contains no payment execution calls", () => {
  for (const forbidden of [
    "paymentLinks.create(",
    "payments.create(",
    "insertOne(",
    "updateOne(",
    "findOneAndUpdate("
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});

test("production environment rejects five-source construction", async () => {
  const previous = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = "production";

    await assert.rejects(
      createV3ServerOwnedSdkFiveSourceDiagnosticReview(),
      { message: "V3_SANDBOX_FIVE_SOURCE_REVIEW_DISABLED" }
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("non-sandbox environment rejects construction", async () => {
  const previous = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.SQUARE_ENVIRONMENT = "production";

    await assert.rejects(
      createV3ServerOwnedSdkFiveSourceDiagnosticReview(),
      { message: "V3_SANDBOX_FIVE_SOURCE_REVIEW_DISABLED" }
    );
  } finally {
    if (previous === undefined)
      delete process.env.SQUARE_ENVIRONMENT;
    else process.env.SQUARE_ENVIRONMENT = previous;
  }
});
