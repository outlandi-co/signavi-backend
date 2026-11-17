import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyV3OrderPaymentBinding
} from "./smartShippingV3OrderPaymentBinding.js";

import {
  createV3SquareSafeCheckoutReference
} from "./smartShippingV3CheckoutReference.js";

const orderId = "507f1f77bcf86cd799439011";

function fixture(storefront = "signavi_store") {
  const reference = createV3SquareSafeCheckoutReference({
    orderId
  });

  return {
    order: {
      _id: orderId,
      storefront,
      source: "store",
      status: "payment_required",
      paymentStatus: "unpaid",
      currency: "USD",
      paymentUrl: "",
      squarePaymentLinkId: "",
      squareOrderId: "",
      squarePaymentId: ""
    },

    prepared: {
      orderId,
      subtotalCents: 2000,
      taxCents: 160,
      shippingAmountCents: 500,
      totalCents: 2660
    },

    operation: {
      orderId,
      checkoutReferenceId: reference,
      amountCents: 2660,
      environment: "sandbox",
      status: "pending",
      idempotencyKey: "signavi-v3-sandbox-test-operation"
    }
  };
}

test("Valid Store order passes V3 binding", () => {
  const result = verifyV3OrderPaymentBinding(
    fixture("signavi_store")
  );

  assert.equal(result.bindingVerified, true);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.environment, "sandbox");
});

test("Studio order cannot enter Store V3 binding", () => {
  assert.throws(
    () => verifyV3OrderPaymentBinding(
      fixture("signavi_studio")
    ),
    /V3 storefront ownership mismatch/
  );
});

test("Missing storefront fails closed", () => {
  const data = fixture();
  delete data.order.storefront;

  assert.throws(
    () => verifyV3OrderPaymentBinding(data),
    /V3 storefront ownership mismatch/
  );
});

test("Unknown storefront fails closed", () => {
  assert.throws(
    () => verifyV3OrderPaymentBinding(
      fixture("unknown_store")
    ),
    /V3 storefront ownership mismatch/
  );
});

test("Invalid payment amount remains rejected", () => {
  const data = fixture();
  data.operation.amountCents = 9999;

  assert.throws(
    () => verifyV3OrderPaymentBinding(data),
    /V3 order\/payment binding mismatch/
  );
});

test("Existing payment link remains rejected", () => {
  const data = fixture();
  data.order.paymentUrl = "https://example.com/existing";

  assert.throws(
    () => verifyV3OrderPaymentBinding(data),
    /V3 order is not eligible for payment/
  );
});

test("Conflicting Store and Studio channels fail closed", () => {
  const data = fixture("signavi_store");
  data.order.salesChannel = "signavi_studio";

  assert.throws(
    () => verifyV3OrderPaymentBinding(data),
    /V3 storefront ownership mismatch/
  );
});

test("Matching Store ownership fields are accepted", () => {
  const data = fixture("signavi_store");
  data.order.salesChannel = "signavi_store";

  const result = verifyV3OrderPaymentBinding(data);

  assert.equal(result.bindingVerified, true);
  assert.equal(result.squareRequestAuthorized, false);
});
