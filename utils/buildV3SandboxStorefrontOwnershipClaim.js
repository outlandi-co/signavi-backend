import mongoose from "mongoose";

/**
 * Builds a conditional ownership update for an existing
 * unpaid Sandbox storefront order.
 *
 * This is a pure query builder.
 * It performs no database or Square operations.
 *
 * Authorization and fresh-state checks must occur separately
 * inside the same trusted transaction.
 */
export function buildV3SandboxStorefrontOwnershipClaim({
  orderId,
  amountCents,
  expectedRevision,
  owner
} = {}) {
  const id = String(orderId ?? "");

  if (!/^[a-fA-F0-9]{24}$/.test(id)) {
    throw new Error("V3_CLAIM_INVALID_ORDER_ID");
  }

  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error("V3_CLAIM_INVALID_AMOUNT");
  }

  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    throw new Error("V3_CLAIM_INVALID_REVISION");
  }

  if (
    typeof owner !== "string" ||
    !/^[a-zA-Z0-9:_-]{8,160}$/.test(owner)
  ) {
    throw new Error("V3_CLAIM_INVALID_OWNER");
  }

  const filter = {
    _id: new mongoose.Types.ObjectId(id),

    source: { $in: ["store", "cart_drawer"] },

    status: "payment_required",
    paymentStatus: "unpaid",
    squareEnvironment: "sandbox",
    squareExpectedAmountCents: amountCents,

    v3SandboxInitializationOwner: "",
    v3SandboxInitializationRevision: expectedRevision,

    squarePaymentId: { $in: ["", null] },
    squarePaymentLinkId: { $in: ["", null] },
    squareOrderId: { $in: ["", null] },
    paymentUrl: { $in: ["", null] },
    paidAt: null
  };

  const update = {
    $set: {
      v3SandboxInitializationOwner: owner
    },
    $inc: {
      v3SandboxInitializationRevision: 1
    }
  };

  return {
    filter,
    update,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  };
}