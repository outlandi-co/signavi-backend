import {
  assertV3TrustedSandboxFirstPaymentAuthorization
} from "./assertV3TrustedSandboxFirstPaymentAuthorization.js"
import {
  getV3SandboxConnection
} from "./v3SandboxDatabaseConnection.js";

import {
  getV3SandboxModels
} from "./v3SandboxModels.js";

import {
  acquireV3IsolatedCheckoutLock,
  releaseV3IsolatedCheckoutLock
} from "./smartShippingV3CheckoutLock.js";

import mongoose from "mongoose";
import Order from "../models/Order.js";
import {
  prepareV3CheckoutPayment
} from "./smartShippingV3PaymentPreparation.js";

import {
  reserveV3VerifiedSandboxRequest
} from "./smartShippingV3VerifiedSandboxReservation.js";

import {
  runV3TrustedSandboxExecution
} from "./smartShippingV3TrustedExecution.js";

/**
 * Internal-only sandbox payment handoff.
 *
 * The caller must already own the durable checkout lock.
 * Neither orderId nor owner may be trusted directly from HTTP.
 *
 * This module does not register a route or grant checkout
 * authorization to a browser.
 */
export async function executeV3TrustedSandboxHandoff({
  orderId,
  owner
}) {
  if (
    !["development", "test"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    (await getV3SandboxConnection()).db?.databaseName !== "signavi_shipping_v3_dev"
  ) {
    throw new Error("V3_SANDBOX_HANDOFF_DISABLED");
  }

  if (
    !mongoose.isValidObjectId(orderId) ||
    typeof owner !== "string" ||
    !owner.trim()
  ) {
    throw new Error("V3_SANDBOX_HANDOFF_INVALID_IDENTITY");
  }

  // Merchant identity is verified before durable reservation.
  // Reservation uses the existing atomic ownership transition.
  // Reject missing first-payment authority before creating
  // or mutating a durable payment reservation.
  // The executor independently enforces the same boundary.
  assertV3TrustedSandboxFirstPaymentAuthorization()

  const reservation =
    await reserveV3VerifiedSandboxRequest({
      orderId,
      owner
    });

  if (
    reservation?.merchantIdentityVerified !== true ||
    reservation.requestReserved !== true ||
    reservation.environment !== "sandbox" ||
    reservation.status !== "reconciliation_required" ||
    reservation.squareRequestAuthorized !== false ||
    reservation.paymentCreated !== false ||
    reservation.orderId !== String(orderId).toLowerCase() ||
    reservation.owner !== owner
  ) {
    throw new Error("V3_SANDBOX_HANDOFF_RESERVATION_REJECTED");
  }

  // Existing trusted executor owns the Square creation claim,
  // response verification and durable recording.
  //
  // Never automatically retry after an uncertain outcome.
  return runV3TrustedSandboxExecution({
    orderId: reservation.orderId,
    owner: reservation.owner
  });
}

// Server-only sandbox checkout entry point.
// Caller must authenticate order and verify signed quote first.
export async function executeV3TrustedSandboxCheckout({
  orderId,
  guestToken,
  signedQuote
}) {
  // Deny missing customer credentials before touching sandbox state.
  if (
    typeof guestToken !== "string" ||
    !guestToken.trim() ||
    typeof signedQuote !== "string" ||
    !signedQuote.trim()
  ) {
    throw new Error("V3_SANDBOX_CHECKOUT_CREDENTIALS_REQUIRED");
  }

  if (!mongoose.isValidObjectId(orderId)) {
    throw new Error("V3_SANDBOX_CHECKOUT_INVALID_ORDER");
  }

  // Authoritative storefront order, never the sandbox replica.
  if (
    mongoose.connection.readyState !== 1 ||
    mongoose.connection.db?.databaseName !== "signavi_store" ||
    Order.db !== mongoose.connection
  ) {
    throw new Error("V3_STOREFRONT_AUTHORITY_REQUIRED");
  }

  const storefrontOrder = await Order.findById(orderId);

  if (!storefrontOrder) {
    throw new Error("V3_STOREFRONT_ORDER_NOT_FOUND");
  }

  const prepared = prepareV3CheckoutPayment({
    order: storefrontOrder,
    guestToken,
    signedQuote
  });

  if (
    !prepared ||
    String(prepared.orderId).toLowerCase() !==
      String(orderId).toLowerCase() ||
    !Number.isSafeInteger(prepared.totalCents) ||
    prepared.totalCents < 1 ||
    !Number.isSafeInteger(
      storefrontOrder.squareExpectedAmountCents
    ) ||
    storefrontOrder.squareExpectedAmountCents !==
      prepared.totalCents
  ) {
    throw new Error("V3_STOREFRONT_CHECKOUT_NOT_VERIFIED");
  }
  if (
    !["development", "test"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    (await getV3SandboxConnection()).db?.databaseName !== "signavi_shipping_v3_dev"
  ) {
    throw new Error("V3_SANDBOX_CHECKOUT_DISABLED");
  }

  if (!mongoose.isValidObjectId(orderId)) {
    throw new Error("V3_SANDBOX_CHECKOUT_INVALID_ORDER");
  }

  const id = String(orderId).toLowerCase();

  const connection = await getV3SandboxConnection();

  if (
    connection === mongoose.connection ||
    connection.readyState !== 1 ||
    connection.db?.databaseName !== "signavi_shipping_v3_dev"
  ) {
    throw new Error("V3_SANDBOX_CHECKOUT_ISOLATION_REQUIRED");
  }

  const { CheckoutLock } = getV3SandboxModels(connection);

  if (CheckoutLock.db !== connection) {
    throw new Error("V3_SANDBOX_CHECKOUT_MODEL_MISMATCH");
  }

  const lock = await acquireV3IsolatedCheckoutLock(
    id,
    { CheckoutLock }
  );

  try {
    if (
      !lock?.owner ||
      !(lock.expiresAt instanceof Date) ||
      lock.expiresAt <= new Date() ||
      String(lock.orderId).toLowerCase() !== id
    ) {
      throw new Error("V3_SANDBOX_CHECKOUT_LOCK_REJECTED");
    }

    return await executeV3TrustedSandboxHandoff({
      orderId: id,
      owner: lock.owner
    });
  } finally {
    await releaseV3IsolatedCheckoutLock(
      lock,
      { CheckoutLock }
    );
  }
}
