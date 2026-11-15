import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3SandboxOrderRecordEvidence
} from "../utils/collectV3SandboxOrderRecordEvidence.js";

import {
  collectV3SandboxPaymentRecordEvidence
} from "../utils/collectV3SandboxPaymentRecordEvidence.js";

import {
  adaptV3FirstPaymentReaderEvidence
} from "../utils/adaptV3FirstPaymentReaderEvidence.js";

const orderId = "0123456789abcdef01234567";

const readOrders = (listPage) =>
  collectV3SandboxOrderRecordEvidence({ orderId, listPage });

const readPayments = (listPage) =>
  collectV3SandboxPaymentRecordEvidence({ orderId, listPage });

const noAuthority = (result) => {
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.retryAuthorized, false);
};

const reviewWithActualRecords = (squareOrders, squarePayments) =>
  adaptV3FirstPaymentReaderEvidence({
    knownHistory: { knownRecordsClear: true },
    ownership: { exclusive: true, durable: true },
    paymentLinks: { complete: true, priorActivityFound: false },
    squareOrders,
    squarePayments
  });

test("empty order history does not establish payment authority", async () => {
  let calls = 0;

  const evidence = await readOrders(async () => {
    calls++;
    return { orders: [], cursor: null };
  });

  assert.equal(calls, 1);
  assert.equal(evidence.complete, true);
  assert.equal(evidence.priorActivityFound, false);
  assert.equal(evidence.authoritativeNoPriorActivity, false);
  noAuthority(evidence);
});

test("empty payment history does not establish payment authority", async () => {
  let calls = 0;

  const evidence = await readPayments(async () => {
    calls++;
    return { payments: [], cursor: null };
  });

  assert.equal(calls, 1);
  assert.equal(evidence.complete, true);
  assert.equal(evidence.priorActivityFound, false);
  noAuthority(evidence);
});

test("actual empty-history outputs cannot pass strict review", async () => {
  const orders = await readOrders(async () => ({
    orders: [],
    cursor: null
  }));

  const payments = await readPayments(async () => ({
    payments: [],
    cursor: null
  }));

  const result = reviewWithActualRecords(orders, payments);

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.reason, "EVIDENCE_FIELD_INVALID");
  assert.equal(result.source, "PaymentLinks");
  noAuthority(result);
});

test("previous Square order is detected", async () => {
  const evidence = await readOrders(async () => ({
    orders: [{
      id: "square-order-existing",
      referenceId: `id:${orderId}`
    }],
    cursor: null
  }));

  assert.equal(evidence.priorActivityFound, true);
  noAuthority(evidence);
});

test("previous Square payment is detected", async () => {
  const evidence = await readPayments(async () => ({
    payments: [{
      id: "square-payment-existing",
      referenceId: `id:${orderId}`
    }],
    cursor: null
  }));

  assert.equal(evidence.priorActivityFound, true);
  noAuthority(evidence);
});

test("unknown Square payment identity cannot establish clearance", async () => {
  const evidence = await readPayments(async () => ({
    payments: [{ id: "unidentified-payment" }],
    cursor: null
  }));

  assert.equal(evidence.complete, false);
  assert.equal(
    evidence.reason,
    "SQUARE_PAYMENT_REFERENCE_MISSING"
  );
  noAuthority(evidence);
});

test("Square order reader errors fail closed", async () => {
  const evidence = await readOrders(async () => {
    throw new Error("Simulated read failure");
  });

  assert.equal(evidence.complete, false);
  assert.equal(evidence.reason, "SQUARE_ORDER_SEARCH_FAILED");
  noAuthority(evidence);
});

test("Square payment reader errors fail closed", async () => {
  const evidence = await readPayments(async () => {
    throw new Error("Simulated read failure");
  });

  assert.equal(evidence.complete, false);
  assert.equal(evidence.reason, "SQUARE_PAYMENT_READ_FAILED");
  noAuthority(evidence);
});

test("pagination limit prevents a favorable finding", async () => {
  const evidence = await readPayments(async ({ cursor }) => ({
    payments: [],
    cursor: cursor === null ? "next-page" : "another-page"
  }));

  assert.equal(evidence.complete, false);
  noAuthority(evidence);
});
