import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createV3ServerOwnedPaymentLinkDiagnosticReview
} from "../utils/createV3ServerOwnedPaymentLinkDiagnosticReview.js";

import {
  createV3UnresolvedSquareEvidenceReaders
} from "../utils/createV3ServerOwnedFiveSourceDiagnosticReview.js";

import {
  createV3ServerOwnedSandboxPaymentLinkEvidenceReader
} from "../utils/createV3ServerOwnedSandboxPaymentLinkEvidenceReader.js";

import {
  createV3ServerBoundFirstPaymentReview
} from "../utils/createV3ServerBoundFirstPaymentReview.js";

const orderId = "507f1f77bcf86cd799439011";

test("server-owned composition exposes no configuration parameters", () => {
  assert.equal(
    createV3ServerOwnedPaymentLinkDiagnosticReview.length,
    0
  );
});

test("Square Orders and Payments remain unresolved", async () => {
  const readers = createV3UnresolvedSquareEvidenceReaders();

  for (const name of [
    "readSquareOrders",
    "readSquarePayments"
  ]) {
    const report = await readers[name]({ orderId });

    assert.equal(report.complete, false);
    assert.equal(report.provenanceVerified, false);
    assert.equal(report.squareRequestAuthorized, false);
    assert.equal(report.retryAuthorized, false);
  }
});

test("SDK Payment Link failure cannot clear five-source review", async () => {
  let listCalls = 0;

  const readPaymentLinks =
    createV3ServerOwnedSandboxPaymentLinkEvidenceReader({
      testClient: {
        checkout: {
          paymentLinks: {
            async list() {
              listCalls++;
              throw new Error("Simulated Square transport failure");
            }
          }
        },
        orders: {
          async get() {
            throw new Error("Unexpected order lookup");
          }
        }
      }
    });

  const local = {
    async readKnownHistory() {
      return {
        orderId,
        environment: "sandbox",
        complete: true,
        knownRecordsClear: true
      };
    },

    async readOwnership() {
      return {
        orderId,
        environment: "sandbox",
        complete: true,
        exclusive: true,
        durable: true
      };
    }
  };

  const unresolved = createV3UnresolvedSquareEvidenceReaders();

  const service = createV3ServerBoundFirstPaymentReview({
    ...local,
    readPaymentLinks,
    readSquareOrders: unresolved.readSquareOrders,
    readSquarePayments: unresolved.readSquarePayments
  });

  const result = await service.reviewWithDiagnostics(orderId);

  assert.ok(listCalls >= 1);
  assert.equal(result.review.readyForAuthorizationReview, false);
  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(
    result.crossSourceReconciliation.squareRequestAuthorized,
    false
  );
});

test("production rejects server-owned diagnostic construction", async () => {
  const savedNode = process.env.NODE_ENV;
  const savedSquare = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.NODE_ENV = "production";
    process.env.SQUARE_ENVIRONMENT = "sandbox";

    await assert.rejects(
      createV3ServerOwnedPaymentLinkDiagnosticReview(),
      { message: "V3_SANDBOX_LOCAL_REVIEW_REQUIRED" }
    );
  } finally {
    if (savedNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNode;

    if (savedSquare === undefined)
      delete process.env.SQUARE_ENVIRONMENT;
    else process.env.SQUARE_ENVIRONMENT = savedSquare;
  }
});

test("composition contains no payment execution calls", () => {
  const source = readFileSync(
    new URL(
      "../utils/createV3ServerOwnedPaymentLinkDiagnosticReview.js",
      import.meta.url
    ),
    "utf8"
  );

  assert.equal(source.includes("paymentLinks.create("), false);
  assert.equal(source.includes("payments.create("), false);
  assert.equal(source.includes("insertOne("), false);
  assert.equal(source.includes("updateOne("), false);

  assert.equal(
    source.includes("createV3ServerOwnedSandboxPaymentLinkEvidenceReader"),
    true
  );

  assert.equal(
    source.includes("createV3UnresolvedSquareEvidenceReaders"),
    true
  );
});
