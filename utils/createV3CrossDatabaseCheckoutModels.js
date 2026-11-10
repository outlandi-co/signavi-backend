import mongoose from "mongoose";

import Order from "../models/Order.js";
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js";
import Ownership from "../models/SmartShippingV3PurchaseOwnership.js";
import Association from "../models/SmartShippingV3InvoiceOrderAssociation.js";
import SharedReservation from "../models/SharedSquarePaymentReservation.js";

const STORE = "signavi_store";
const SANDBOX = "signavi_shipping_v3_dev";

function requireConnection(connection, databaseName) {
  if (
    !connection ||
    connection.readyState !== 1 ||
    connection.db?.databaseName !== databaseName ||
    typeof connection.getClient !== "function"
  ) {
    throw new Error("V3_DATABASE_CONNECTION_REJECTED");
  }
}

function bindModel(connection, sourceModel) {
  const name = sourceModel.modelName;

  const existing = connection.models[name];

  if (existing) {
    if (
      existing.db !== connection ||
      existing.collection.name !== sourceModel.collection.name
    ) {
      throw new Error("V3_MODEL_BINDING_CONFLICT");
    }

    return existing;
  }

  return connection.model(
    name,
    sourceModel.schema.clone(),
    sourceModel.collection.name
  );
}

/**
 * Bind the checkout repositories to the proper databases.
 *
 * This function does not:
 * - open database connections
 * - read or write records
 * - create indexes
 * - execute Square requests
 * - authorize checkout
 *
 * The checkout lock is managed separately by the existing
 * sandbox checkout-lock implementation.
 */
export function createV3CrossDatabaseCheckoutModels({
  storefrontConnection,
  sandboxConnection
} = {}) {
  requireConnection(storefrontConnection, STORE);
  requireConnection(sandboxConnection, SANDBOX);

  if (
    storefrontConnection === sandboxConnection ||
    storefrontConnection.getClient() !==
      sandboxConnection.getClient()
  ) {
    throw new Error("V3_SHARED_CLIENT_REQUIRED");
  }

  // Existing application models belong to the default Store DB.
  if (
    storefrontConnection !== mongoose.connection ||
    Order.db !== storefrontConnection ||
    SharedReservation.db !== storefrontConnection
  ) {
    throw new Error("V3_STOREFRONT_MODEL_BOUNDARY_REJECTED");
  }

  const models = {
    StoreOrder: Order,

    StoreSharedReservation: SharedReservation,

    SandboxPaymentOperation: bindModel(
      sandboxConnection,
      PaymentOperation
    ),

    SandboxOwnership: bindModel(
      sandboxConnection,
      Ownership
    ),

    SandboxAssociation: bindModel(
      sandboxConnection,
      Association
    ),

    SandboxSharedReservation: bindModel(
      sandboxConnection,
      SharedReservation
    )
  };

  for (const model of Object.values(models)) {
    if (model.db?.readyState !== 1) {
      throw new Error("V3_MODEL_CONNECTION_UNAVAILABLE");
    }
  }

  return Object.freeze(models);
}