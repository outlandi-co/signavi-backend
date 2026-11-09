import mongoose from "mongoose";

import Order from "../models/Order.js";
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js";

const DATABASE_NAME = "signavi_shipping_v3_dev";

const checkoutLockSchema = new mongoose.Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    owner: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    versionKey: false,
    collection: "smart_shipping_v3_checkout_locks"
  }
);
export function getV3SandboxModels(connection) {
  if (
    !connection ||
    connection === mongoose.connection ||
    connection.readyState !== 1 ||
    connection.db?.databaseName !== DATABASE_NAME
  ) {
    throw new Error("V3_SANDBOX_MODEL_ISOLATION_REQUIRED");
  }

  const SandboxOrder =
    connection.models.Order ||
    connection.model(
      "Order",
      Order.schema.clone()
    );

  const SandboxPaymentOperation =
    connection.models.SmartShippingV3PaymentOperation ||
    connection.model(
      "SmartShippingV3PaymentOperation",
      PaymentOperation.schema.clone()
    );

  if (
    SandboxOrder.db !== connection ||
    SandboxPaymentOperation.db !== connection
  ) {
    throw new Error("V3_SANDBOX_MODEL_BINDING_FAILED");
  }

  const SandboxCheckoutLock =
    connection.models.SmartShippingV3CheckoutLock ||
    connection.model(
      "SmartShippingV3CheckoutLock",
      checkoutLockSchema.clone()
    );

  if (SandboxCheckoutLock.db !== connection) {
    throw new Error("V3_SANDBOX_MODEL_BINDING_FAILED");
  }

  return Object.freeze({
    Order: SandboxOrder,
    PaymentOperation: SandboxPaymentOperation,
    CheckoutLock: SandboxCheckoutLock
  });
}
