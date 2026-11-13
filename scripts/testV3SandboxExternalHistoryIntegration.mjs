import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3SandboxPaymentRecordEvidence
} from "../utils/collectV3SandboxPaymentRecordEvidence.js";

import {
  collectV3SandboxOrderRecordEvidence
} from "../utils/collectV3SandboxOrderRecordEvidence.js";

import {
  inspectV3SandboxExternalHistory
} from "../utils/inspectV3SandboxExternalHistory.js";

const orderId = "507f1f77bcf86cd799439011";

function makeReaders({
  payments = [{ id: "p_other", referenceId: "unrelated" }],
  orders = [{ id: "o_other", referenceId: "unrelated" }],
  paymentFailure = false,
  orderFailure = false
} = {}) {
  return {
    readPayments: ({ orderId }) =>
      collectV3SandboxPaymentRecordEvidence({
        orderId,
        listPage: async () => {
          if (paymentFailure) throw Error("Simulated outage");
          return { payments };
        }
      }),

    readOrders: ({ orderId }) =>
      collectV3SandboxOrderRecordEvidence({
        orderId,
        listPage: async () => {
          if (orderFailure) throw Error("Simulated outage");
          return { orders };
        }
      })
  };
}

async function inspect(readers) {
  const result = await inspectV3SandboxExternalHistory({
    orderId,
    testReaders: readers
  });

  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  return result;
}

test("real collectors produce compatible read-only evidence", async () => {
  const result = await inspect(makeReaders());
  assert.equal(result.inspected, true);
  assert.equal(result.priorActivityFound, false);
});

test("existing Square payment prevents clean inspection", async () => {
  const result = await inspect(makeReaders({
    payments: [{
      id: "p_existing",
      referenceId: `ID:${orderId}`
    }]
  }));

  assert.equal(result.inspected, false);
  assert.equal(result.reason, "PAYMENT_HISTORY_PRIOR_ACTIVITY");
});

test("existing Square order prevents clean inspection", async () => {
  const result = await inspect(makeReaders({
    orders: [{
      id: "o_existing",
      referenceId: `signavi-v3-sandbox-${orderId}`
    }]
  }));

  assert.equal(result.inspected, false);
  assert.equal(result.reason, "ORDER_HISTORY_PRIOR_ACTIVITY");
});

test("payment history outage fails closed", async () => {
  const result = await inspect(makeReaders({
    paymentFailure: true
  }));
  assert.equal(result.inspected, false);
});

test("order history outage fails closed", async () => {
  const result = await inspect(makeReaders({
    orderFailure: true
  }));
  assert.equal(result.inspected, false);
});

test("unidentified payment fails closed", async () => {
  const result = await inspect(makeReaders({
    payments: [{ id: "p_unknown" }]
  }));
  assert.equal(result.inspected, false);
});