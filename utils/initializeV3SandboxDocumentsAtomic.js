import mongoose from "mongoose";
import { getV3SandboxModels } from "./v3SandboxModels.js";

import Order from "../models/Order.js";
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js";

import {
  assessV3SharedTransactionTopology
} from "./assessV3SharedTransactionTopology.js";

import {
  buildV3SandboxStorefrontOwnershipClaim
} from "./buildV3SandboxStorefrontOwnershipClaim.js";

import {
  buildV3SandboxInitializationDocuments
} from "./buildV3SandboxInitializationDocuments.js";

/**
 * Internal transaction implementation.
 *
 * No public payment or initialization authorization.
 * No Square calls.
 * No storefront writes.
 */
const writeIsolatedDocuments = async ({
  storefrontConnection,
  connection,
  orderId,
  amountCents,
  expectedRevision,
  owner
}) => {
  // This is still an internal, test-only integration boundary.
  // Payment-history authority is NOT yet connected.
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    process.env.SMART_SHIPPING_V3_ENABLED !== "true"
  ) {
    throw new Error("V3_SANDBOX_INITIALIZATION_DISABLED");
  }

  if (
    !storefrontConnection ||
    !connection ||
    storefrontConnection === connection ||
    connection === mongoose.connection ||
    storefrontConnection.readyState !== 1 ||
    connection.readyState !== 1 ||
    storefrontConnection.db?.databaseName !== "signavi_store" ||
    connection.db?.databaseName !== "signavi_shipping_v3_dev"
  ) {
    throw new Error("V3_SANDBOX_DATABASE_BOUNDARY_REJECTED");
  }

  const topology = assessV3SharedTransactionTopology({
    storefrontConnection,
    sandboxConnection: connection
  });

  if (!topology.compatible) {
    throw new Error(
      "V3_SANDBOX_TRANSACTION_TOPOLOGY_REJECTED:" +
      topology.reason
    );
  }

  const claim = buildV3SandboxStorefrontOwnershipClaim({
    orderId,
    amountCents,
    expectedRevision,
    owner
  });

  const models = getV3SandboxModels(connection);

  // Native collections use the same underlying MongoDB client/session.
  const storefrontOrders = storefrontConnection.collection(
    Order.collection.name
  );

  const storefrontOperations = storefrontConnection.collection(
    PaymentOperation.collection.name
  );

  const id = claim.filter._id;

  // CRITICAL: Do not start writing until trusted, independent
  // payment-history and authorization evidence is integrated.
  // The current evidence callback contract is insufficient.
  throw new Error(
    "V3_SANDBOX_TRUSTED_PAYMENT_HISTORY_NOT_CONNECTED"
  );

  // STAGED IMPLEMENTATION ONLY.
  //
  // The unconditional payment-history rejection above makes this
  // transaction unreachable. It must not be enabled until trusted
  // authorization, invoice, shipping, and external payment evidence
  // are established with suitable freshness and ownership controls.

  const session = await storefrontConnection.startSession();

  try {
    return await session.withTransaction(async () => {
      const freshOrder = await storefrontOrders.findOne(
        { _id: id },
        { session }
      );

      const freshOperation = await storefrontOperations.findOne(
        { orderId: id },
        { session }
      );

      if (!freshOrder || !freshOperation) {
        throw new Error(
          "V3_SANDBOX_FRESH_STOREFRONT_STATE_REQUIRED"
        );
      }

      const candidate = buildV3SandboxInitializationDocuments({
        storefrontOrder: freshOrder,
        storefrontOperation: freshOperation
      });

      if (
        candidate.eligible !== true ||
        candidate.orderId !== String(id) ||
        candidate.amountCents !== amountCents
      ) {
        throw new Error(
          "V3_SANDBOX_FRESH_CANDIDATE_REJECTED"
        );
      }

      const result = await storefrontOrders.updateOne(
        claim.filter,
        claim.update,
        { session }
      );

      if (result.matchedCount !== 1) {
        throw new Error(
          "V3_SANDBOX_STOREFRONT_OWNERSHIP_REJECTED"
        );
      }

      const existingOrder = await models.Order
        .findById(id)
        .session(session);

      const existingOperation = await models.PaymentOperation
        .findOne({ orderId: id })
        .session(session);

      if (existingOrder || existingOperation) {
        throw new Error(
          "V3_SANDBOX_INITIALIZATION_RECORD_ALREADY_EXISTS"
        );
      }

      await models.Order.create(
        [{ ...candidate.orderDocument, _id: id }],
        { session }
      );

      await models.PaymentOperation.create(
        [{ ...candidate.operationDocument, orderId: id }],
        { session }
      );

      return Object.freeze({
        initialized: true,
        orderId: candidate.orderId,
        amountCents: candidate.amountCents,
        paymentCreated: false,
        squareRequestAuthorized: false,
        retryAuthorized: false
      });
    });
  } finally {
    await session.endSession();
  }
};

/**
 * Deliberately disabled until trusted storefront,
 * shipping, invoice, and payment-history checks
 * are connected and tested.
 */
export async function initializeV3SandboxDocumentsAtomic() {
  if (
    !["development", "test"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    process.env.SMART_SHIPPING_V3_ENABLED !== "true"
  ) {
    throw new Error("V3_SANDBOX_INITIALIZATION_DISABLED");
  }

  throw new Error(
    "V3_SANDBOX_INITIALIZATION_AUTHORIZATION_NOT_CONNECTED"
  );
}