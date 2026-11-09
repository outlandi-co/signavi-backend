import mongoose from "mongoose";

import Order from "../models/Order.js";
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js";
import PurchaseOwnership from "../models/SmartShippingV3PurchaseOwnership.js";
import SquareReservation from "../models/SquarePaymentCreationReservation.js";
import SharedReservation from "../models/SharedSquarePaymentReservation.js";
import Association from "../models/SmartShippingV3InvoiceOrderAssociation.js";
import ProductionReservation from "../models/SmartShippingV3ProductionPurchaseReservation.js";

const STORE = "signavi_store";
const SANDBOX = "signavi_shipping_v3_dev";

const blocked = (orderId, reason, source = null) => Object.freeze({
  orderId,
  environment: "sandbox",
  complete: false,
  knownRecordsClear: false,
  reason,
  source,
  authoritativeNoPriorActivity: false,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Read-only inspection of known local V3 payment records.
 *
 * Does not establish exhaustive historical clearance.
 * Does not acquire ownership or authorize payment execution.
 *
 * Bind connections on the trusted backend, never from HTTP input.
 */
export function createV3SandboxLocalHistoryReader({
  storefrontConnection,
  sandboxConnection
} = {}) {
  if (
    (
      process.env.NODE_ENV !== "test" &&
      storefrontConnection !== mongoose.connection
    ) ||
    !storefrontConnection ||
    !sandboxConnection ||
    storefrontConnection === sandboxConnection ||
    storefrontConnection.readyState !== 1 ||
    sandboxConnection.readyState !== 1 ||
    storefrontConnection.db?.databaseName !== STORE ||
    sandboxConnection.db?.databaseName !== SANDBOX
  ) {
    throw new Error("SANDBOX_HISTORY_DATABASE_BOUNDARY_REJECTED");
  }

  const readers = [
    {
      name: "StorefrontOrder",
      connection: storefrontConnection,
      collection: Order.collection.name,
      filter: id => ({ _id: id }),
      required: true
    },
    {
      name: "StorefrontInvoiceOrderAssociation",
      connection: storefrontConnection,
      collection: Association.collection.name,
      filter: id => ({
        environment: "sandbox",
        orderId: id
      })
    },
    {
      name: "StorefrontPaymentOperation",
      connection: storefrontConnection,
      collection: PaymentOperation.collection.name,
      filter: id => ({ orderId: id })
    },
    {
      name: "SandboxPaymentOperation",
      connection: sandboxConnection,
      collection: PaymentOperation.collection.name,
      filter: id => ({ orderId: id, environment: "sandbox" })
    },
    {
      name: "SandboxPurchaseOwnership",
      connection: sandboxConnection,
      collection: PurchaseOwnership.collection.name,
      filter: id => ({
        environment: "sandbox",
        purchaseKey: `order:${id.toString()}`
      })
    },
    {
      name: "StorefrontProductionPurchaseReservation",
      connection: storefrontConnection,
      collection: ProductionReservation.collection.name,
      filter: id => ({
        orderId: id,
        environment: "production"
      })
    },
    {
      name: "StorefrontProductionSquareReservation",
      connection: storefrontConnection,
      collection: SquareReservation.collection.name,
      filter: id => ({
        orderId: id,
        environment: "production"
      })
    },
    {
      name: "StorefrontProductionSharedReservation",
      connection: storefrontConnection,
      collection: SharedReservation.collection.name,
      filter: id => ({
        documentType: "order",
        documentId: id,
        environment: "production"
      })
    },
    ...[
      ["StorefrontSquareReservation", storefrontConnection],
      ["SandboxSquareReservation", sandboxConnection]
    ].map(([name, connection]) => ({
      name,
      connection,
      collection: SquareReservation.collection.name,
      filter: id => ({
        orderId: id,
        environment: "sandbox"
      })
    })),
    ...[
      ["StorefrontSharedReservation", storefrontConnection],
      ["SandboxSharedReservation", sandboxConnection]
    ].map(([name, connection]) => ({
      name,
      connection,
      collection: SharedReservation.collection.name,
      filter: id => ({
        documentType: "order",
        documentId: id,
        environment: "sandbox"
      })
    }))
  ];

  for (const reader of readers) {
    reader.handle = reader.connection.collection(reader.collection);

    if (typeof reader.handle?.findOne !== "function") {
      throw new Error("SANDBOX_HISTORY_REPOSITORY_MISSING");
    }
  }

  return async function readKnownHistory({ orderId } = {}) {
    const id = typeof orderId === "string"
      ? orderId.toLowerCase()
      : "";

    if (!/^[a-f0-9]{24}$/.test(id)) {
      return blocked(id, "INVALID_ORDER_ID");
    }

    try {
      const objectId = new mongoose.Types.ObjectId(id);

      for (const reader of readers) {
        const record = await reader.handle.findOne(
          reader.filter(objectId)
        );

        if (reader.required) {
          if (!record || String(record._id).toLowerCase() !== id) {
            return blocked(
              id,
              "STOREFRONT_ORDER_NOT_VERIFIED",
              reader.name
            );
          }

          const paymentStatus =
            String(record.paymentStatus || "").toLowerCase();

          if (![
            "unpaid",
            "pending",
            "payment_required"
          ].includes(paymentStatus)) {
            return blocked(
              id,
              "ORDER_PAYMENT_STATUS_UNSAFE",
              reader.name
            );
          }

          if (
            record.paymentUrl ||
            record.squarePaymentId ||
            record.squareOrderId ||
            record.squarePaymentLinkId ||
            record.paymentUrlCreatedAt
          ) {
            return blocked(
              id,
              "ORDER_HAS_PAYMENT_EVIDENCE",
              reader.name
            );
          }

          continue;
        }

        if (record != null) {
          return blocked(
            id,
            "EXISTING_LOCAL_PAYMENT_HISTORY",
            reader.name
          );
        }
      }

      return Object.freeze({
        orderId: id,
        environment: "sandbox",
        complete: true,
        knownRecordsClear: true,
        reason: "KNOWN_LOCAL_RECORDS_CLEAR_ONLY",
        source: "MongoDB",
        authoritativeNoPriorActivity: false,
        initializationAuthorized: false,
        squareRequestAuthorized: false,
        retryAuthorized: false
      });
    } catch {
      return blocked(id, "LOCAL_PAYMENT_HISTORY_READ_FAILED");
    }
  };
}