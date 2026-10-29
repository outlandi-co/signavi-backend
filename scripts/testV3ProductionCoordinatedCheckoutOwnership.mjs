import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";

const { coordinateV3ProductionClaimIsolated } =
  await import("../utils/coordinateV3ProductionClaimIsolated.js");

const id = "507f1f77bcf86cd799439011";
const purchaseKey = `signavi-v3-production-purchase-${id}`;

function fixture({
  amount = 2500,
  persistedOwner = true
} = {}) {
  const reservation = {
    _id: "reservation-1",
    orderId: id,
    environment: "production",
    purchaseKey,
    idempotencyKey: purchaseKey,
    status: "reserved",
    attemptClaimedAt: null
  };

  const operation = {
    _id: "operation-1",
    orderId: id,
    environment: "production",
    idempotencyKey: purchaseKey,
    amountCents: amount,
    status: "pending",
    squareCreationAttemptClaimedAt: null,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  };

  let operationWrites = 0;
  let reservationWrites = 0;

  const Reservation = {
    async findOne() {
      return { ...reservation };
    },
    async findOneAndUpdate(filter, update) {
      reservationWrites++;

      return {
        ...reservation,
        ...update.$set,
        ...(persistedOwner ? {} : {
          checkoutClaimOwner: null,
          checkoutClaimAmountCents: null
        })
      };
    }
  };

  const PaymentOperation = {
    async findOne() {
      return { ...operation };
    },
    async findOneAndUpdate(filter, update) {
      operationWrites++;

      return {
        ...operation,
        ...update.$set
      };
    }
  };

  return {
    Reservation,
    PaymentOperation,
    getWrites: () => ({
      operationWrites,
      reservationWrites
    })
  };
}

test("valid checkout ownership persists", async () => {
  const f = fixture();

  const result = await coordinateV3ProductionClaimIsolated({
    orderId: id,
    Reservation: f.Reservation,
    PaymentOperation: f.PaymentOperation,
    checkoutOwner: "checkout-owner-001",
    checkoutAmountCents: 2500
  });

  assert.equal(result.coordinated, true);
  assert.equal(result.squareCreationAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.deepEqual(f.getWrites(), {
    operationWrites: 1,
    reservationWrites: 1
  });
});

test("invalid checkout amount rejected before claim", async () => {
  const f = fixture();

  await assert.rejects(
    coordinateV3ProductionClaimIsolated({
      orderId: id,
      Reservation: f.Reservation,
      PaymentOperation: f.PaymentOperation,
      checkoutOwner: "checkout-owner-001",
      checkoutAmountCents: 0
    }),
    /INVALID_CHECKOUT_CLAIM_INPUT/
  );

  assert.deepEqual(f.getWrites(), {
    operationWrites: 0,
    reservationWrites: 0
  });
});

test("mismatched checkout amount blocks before claim", async () => {
  const f = fixture({ amount: 2500 });

  const result = await coordinateV3ProductionClaimIsolated({
    orderId: id,
    Reservation: f.Reservation,
    PaymentOperation: f.PaymentOperation,
    checkoutOwner: "checkout-owner-001",
    checkoutAmountCents: 5000
  });

  assert.equal(result.blocked, true);
  assert.equal(result.squareCreationAuthorized, false);
  assert.deepEqual(f.getWrites(), {
    operationWrites: 0,
    reservationWrites: 0
  });
});

test("unconfirmed ownership fails closed", async () => {
  const f = fixture({ persistedOwner: false });

  await assert.rejects(
    coordinateV3ProductionClaimIsolated({
      orderId: id,
      Reservation: f.Reservation,
      PaymentOperation: f.PaymentOperation,
      checkoutOwner: "checkout-owner-001",
      checkoutAmountCents: 2500
    }),
    /CHECKOUT_CLAIM_OWNERSHIP_UNCERTAIN/
  );

  assert.deepEqual(f.getWrites(), {
    operationWrites: 1,
    reservationWrites: 1
  });
});