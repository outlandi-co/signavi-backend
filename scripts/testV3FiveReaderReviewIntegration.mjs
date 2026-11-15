import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3ServerBoundFirstPaymentReview
} from "../utils/createV3ServerBoundFirstPaymentReview.js";

import {
  createV3SandboxLocalHistoryReader
} from "../utils/createV3SandboxLocalHistoryReader.js";

import {
  createV3SandboxLinkEvidenceReader
} from "../utils/createV3SandboxLinkEvidenceReader.js";

import {
  createV3SandboxOwnershipSnapshotReader
} from "../utils/createV3SandboxOwnershipSnapshotReader.js";

import {
  collectV3SandboxOrderRecordEvidence
} from "../utils/collectV3SandboxOrderRecordEvidence.js";

import {
  collectV3SandboxPaymentRecordEvidence
} from "../utils/collectV3SandboxPaymentRecordEvidence.js";

const orderId = "507f1f77bcf86cd799439011";

function makeDatabaseFixtures() {
  const calls = [];

  const values = {
    "signavi_store:orders": { _id: orderId }
  };

  function connection(databaseName) {
    return {
      readyState: 1,
      db: { databaseName },

      collection(name) {
        const key = `${databaseName}:${name}`;

        return {
          async findOne(filter) {
            calls.push({ key, operation: "findOne", filter });
            return Object.hasOwn(values, key)
              ? values[key]
              : null;
          },

          find(filter) {
            calls.push({ key, operation: "find", filter });
            return {
              async toArray() {
                return [];
              }
            };
          },

          async countDocuments(filter) {
            calls.push({
              key,
              operation: "countDocuments",
              filter
            });
            return 0;
          }
        };
      }
    };
  }

  return {
    calls,
    storefrontConnection: connection("signavi_store"),
    sandboxConnection:
      connection("signavi_shipping_v3_dev")
  };
}

function createFixture({
  paymentLinks = [],
  linkComplete = true,
  orderPages = [{ orders: [], cursor: null }],
  paymentPages = [{ payments: [], cursor: null }]
} = {}) {
  const db = makeDatabaseFixtures();

  const calls = {
    knownHistory: 0,
    paymentLinks: 0,
    squareOrders: 0,
    squarePayments: 0,
    ownership: 0
  };

  const historyReader =
    createV3SandboxLocalHistoryReader(db);

  const linkReader =
    createV3SandboxLinkEvidenceReader({
      historyReader: {
        async collectHistory() {
          return {
            complete: linkComplete,
            links: paymentLinks
          };
        }
      },
      ordersClient: {
        async get() {
          throw new Error(
            "Unexpected Square order lookup"
          );
        }
      }
    });

  const ownershipReader =
    createV3SandboxOwnershipSnapshotReader(db);

  const configuredReaders = {
    async readKnownHistory(context) {
      calls.knownHistory++;
      return historyReader(context);
    },

    async readPaymentLinks(context) {
      calls.paymentLinks++;
      return linkReader(context);
    },

    async readSquareOrders({ orderId: id }) {
      calls.squareOrders++;
      let index = 0;

      return collectV3SandboxOrderRecordEvidence({
        orderId: id,
        listPage: async () =>
          orderPages[Math.min(index++, orderPages.length - 1)]
      });
    },

    async readSquarePayments({ orderId: id }) {
      calls.squarePayments++;
      let index = 0;

      return collectV3SandboxPaymentRecordEvidence({
        orderId: id,
        listPage: async () =>
          paymentPages[Math.min(index++, paymentPages.length - 1)]
      });
    },

    async readOwnership(context) {
      calls.ownership++;
      return ownershipReader(context);
    }
  };

  return {
    db,
    calls,
    readers: configuredReaders,
    service:
      createV3ServerBoundFirstPaymentReview(
        configuredReaders
      )
  };
}

function assertBlocked(result) {
  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(Object.isFrozen(result), true);
}

test("all five actual reader callbacks execute in isolated review", async () => {
  const fixture = createFixture();

  const result = await fixture.service.review(orderId);

  assertBlocked(result);

  for (const [name, count] of Object.entries(fixture.calls)) {
    assert.equal(
      count,
      1,
      `${name} must be called exactly once`
    );
  }

  const ownershipReads = fixture.db.calls.filter(
    entry => [
      "signavi_store:orders",
      "signavi_store:smart_shipping_v3_payment_operations",
      "signavi_shipping_v3_dev:smart_shipping_v3_purchase_ownership",
      "signavi_shipping_v3_dev:smart_shipping_v3_payment_operations"
    ].includes(entry.key)
  );

  assert.ok(ownershipReads.length >= 4);
});

test("real local-history reader cannot authorize payment", async () => {
  const fixture = createFixture();

  const result =
    await fixture.readers.readKnownHistory({
      orderId,
      environment: "sandbox"
    });

  assert.ok(result && typeof result === "object");
  assert.notEqual(result.squareRequestAuthorized, true);
  assert.notEqual(result.initializationAuthorized, true);
});

test("real empty Payment Links reader does not establish clearance", async () => {
  const fixture = createFixture();

  const result =
    await fixture.readers.readPaymentLinks({ orderId });

  assert.equal(result.complete, true);
  assert.equal(result.priorActivityFound, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("incomplete Payment Links history blocks review", async () => {
  const fixture = createFixture({
    linkComplete: false
  });

  const result = await fixture.service.review(orderId);

  assertBlocked(result);
});

test("previous Square payment blocks five-reader review", async () => {
  const fixture = createFixture({
    paymentPages: [{
      payments: [{
        id: "existing-payment",
        referenceId: `id:${orderId}`
      }],
      cursor: null
    }]
  });

  const result = await fixture.service.review(orderId);

  assertBlocked(result);
});
