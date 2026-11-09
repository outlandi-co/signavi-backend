import mongoose from "mongoose";

import Order from "../models/Order.js";
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js";
import PurchaseOwnership from "../models/SmartShippingV3PurchaseOwnership.js";

import {
  assessV3SandboxOwnershipEvidence
} from "./assessV3SandboxOwnershipEvidence.js";

const blocked = (orderId, reason) => Object.freeze({
  orderId,
  environment: "sandbox",
  complete: false,
  reason,
  exclusive: false,
  durable: false,
  authoritativeNoPriorActivity: false,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

export function createV3SandboxOwnershipSnapshotReader({
  storefrontConnection,
  sandboxConnection
} = {}) {
  const testMode = process.env.NODE_ENV === "test";

  if (
    !testMode &&
    storefrontConnection !== mongoose.connection
  ) {
    throw new Error("STOREFRONT_CONNECTION_NOT_AUTHORITATIVE");
  }

  if (
    !storefrontConnection ||
    !sandboxConnection ||
    storefrontConnection === sandboxConnection ||
    storefrontConnection.readyState !== 1 ||
    sandboxConnection.readyState !== 1 ||
    storefrontConnection.db?.databaseName !== "signavi_store" ||
    sandboxConnection.db?.databaseName !== "signavi_shipping_v3_dev"
  ) {
    throw new Error("OWNERSHIP_DATABASE_BOUNDARY_REJECTED");
  }

  const storefrontOrders = storefrontConnection.collection(
    Order.collection.name
  );

  const storefrontOperations = storefrontConnection.collection(
    PaymentOperation.collection.name
  );

  const sandboxPurchases = sandboxConnection.collection(
    PurchaseOwnership.collection.name
  );

  const sandboxOperations = sandboxConnection.collection(
    PaymentOperation.collection.name
  );

  for (const collection of [
    storefrontOrders,
    storefrontOperations,
    sandboxPurchases,
    sandboxOperations
  ]) {
    if (typeof collection?.findOne !== "function") {
      throw new Error("OWNERSHIP_COLLECTION_READER_INVALID");
    }
  }

  return async function readOwnership({ orderId } = {}) {
    const id = typeof orderId === "string"
      ? orderId.toLowerCase()
      : "";

    if (!/^[a-f0-9]{24}$/.test(id)) {
      return blocked(id, "INVALID_ORDER_ID");
    }

    try {
      const objectId = new mongoose.Types.ObjectId(id);

      // Sequential reads, no writes, no automatic retries.
      const storefrontOrder = await storefrontOrders.findOne({
        _id: objectId
      });

      const storefrontOperation =
        await storefrontOperations.findOne({
          orderId: objectId
        });

      const sandboxPurchase = await sandboxPurchases.findOne({
        environment: "sandbox",
        purchaseKey: `order:${id}`
      });

      const sandboxOperation =
        await sandboxOperations.findOne({
          orderId: objectId,
          environment: "sandbox"
        });

      return assessV3SandboxOwnershipEvidence({
        orderId: id,
        storefront: {
          databaseName: "signavi_store",
          order: storefrontOrder,
          operation: storefrontOperation
        },
        sandbox: {
          databaseName: "signavi_shipping_v3_dev",
          purchase: sandboxPurchase,
          operation: sandboxOperation
        }
      });
    } catch {
      return blocked(id, "OWNERSHIP_DATABASE_READ_FAILED");
    }
  };
}