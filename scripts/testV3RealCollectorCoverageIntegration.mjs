import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3SandboxOrderRecordEvidence
} from "../utils/collectV3SandboxOrderRecordEvidence.js";

import {
  collectV3SandboxPaymentRecordEvidence
} from "../utils/collectV3SandboxPaymentRecordEvidence.js";

import {
  inspectV3FirstPaymentEvidenceContract
} from "../utils/inspectV3FirstPaymentEvidenceContract.js";

const orderId = "a".repeat(24);

const readers = [
  {
    name: "squareOrders",
    field: "orders",
    collect: collectV3SandboxOrderRecordEvidence
  },
  {
    name: "squarePayments",
    field: "payments",
    collect: collectV3SandboxPaymentRecordEvidence
  }
];

function inspect(sourceName, evidence) {
  return inspectV3FirstPaymentEvidenceContract({
    knownHistory: {
      complete: true,
      knownRecordsClear: false,
      authoritativeNoPriorActivity: false
    },
    paymentLinks: {
      complete: false,
      priorActivityFound: false,
      authoritativeNoPriorActivity: false,
      squareRequestAuthorized: false,
      retryAuthorized: false
    },
    squareOrders: sourceName === "squareOrders"
      ? evidence
      : null,
    squarePayments: sourceName === "squarePayments"
      ? evidence
      : null,
    ownership: {
      complete: true,
      exclusive: false,
      durable: false,
      authoritativeNoPriorActivity: false
    }
  });
}

function assertLocked(report, evidence) {
  assert.equal(evidence.authoritativeNoPriorActivity, false);
  assert.equal(evidence.squareRequestAuthorized, false);
  assert.equal(evidence.retryAuthorized, false);

  assert.equal(report.readyForAuthorizationReview, false);
  assert.equal(report.authoritativeNoPriorActivity, false);
  assert.equal(report.initializationAuthorized, false);
  assert.equal(report.squareRequestAuthorized, false);
  assert.equal(report.retryAuthorized, false);
}

for (const reader of readers) {
  test(
    `${reader.name}: completed read cannot certify clearance`,
    async () => {
      const evidence = await reader.collect({
        orderId,
        listPage: async () => ({
          [reader.field]: [],
          cursor: null
        })
      });

      const report = inspect(reader.name, evidence);
      const source = report.sources[reader.name];

      assert.equal(evidence.complete, true);
      assert.equal(source.collectionStatus,
        "REPORTED_COMPLETE_NO_CLEARANCE");
      assert.equal(source.unsafe, true);

      assert.ok(source.missingFields.includes("hasMore"));
      assert.ok(source.missingFields.includes("timedOut"));
      assert.ok(source.missingFields.includes("identityMismatch"));

      assertLocked(report, evidence);
    }
  );

  test(
    `${reader.name}: failed read remains incomplete`,
    async () => {
      const evidence = await reader.collect({
        orderId,
        listPage: async () => {
          throw new Error("SIMULATED_SQUARE_READ_FAILURE");
        }
      });

      const report = inspect(reader.name, evidence);

      assert.equal(evidence.complete, false);
      assert.equal(
        report.sources[reader.name].collectionStatus,
        "REPORTED_INCOMPLETE"
      );

      assert.equal(report.sources[reader.name].unsafe, true);
      assertLocked(report, evidence);
    }
  );

  test(
    `${reader.name}: repeated cursor remains incomplete`,
    async () => {
      let calls = 0;

      const evidence = await reader.collect({
        orderId,
        maxPages: 3,
        listPage: async () => {
          calls++;
          return {
            [reader.field]: [],
            cursor: "repeated_page"
          };
        }
      });

      const report = inspect(reader.name, evidence);

      assert.ok(calls <= 3);
      assert.equal(evidence.complete, false);
      assert.equal(
        report.sources[reader.name].collectionStatus,
        "REPORTED_INCOMPLETE"
      );

      assertLocked(report, evidence);
    }
  );
}

test("missing evidence fields cannot become false claims", async () => {
  const orders = await collectV3SandboxOrderRecordEvidence({
    orderId,
    listPage: async () => ({ orders: [], cursor: null })
  });

  const payments = await collectV3SandboxPaymentRecordEvidence({
    orderId,
    listPage: async () => ({ payments: [], cursor: null })
  });

  const report = inspectV3FirstPaymentEvidenceContract({
    knownHistory: {
      complete: true,
      knownRecordsClear: false
    },
    paymentLinks: {
      complete: false,
      priorActivityFound: false
    },
    squareOrders: orders,
    squarePayments: payments,
    ownership: {
      complete: true,
      exclusive: false,
      durable: false
    }
  });

  assert.equal(report.missingFieldCount, 18);
  assert.equal(report.unsafeSourceCount, 5);

  for (const name of [
    "paymentLinks",
    "squareOrders",
    "squarePayments"
  ]) {
    assert.equal(report.sources[name].unsafe, true);
    assert.ok(report.sources[name].missingFields.length > 0);
  }

  assertLocked(report, orders);
  assertLocked(report, payments);
});
