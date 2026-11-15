import mongoose from "mongoose";

import Order from "../models/Order.js";

import {
  getV3SandboxConnection
} from "./v3SandboxDatabaseConnection.js";

import {
  createV3SandboxLocalHistoryReader
} from "./createV3SandboxLocalHistoryReader.js";

import {
  createV3SandboxOwnershipSnapshotReader
} from "./createV3SandboxOwnershipSnapshotReader.js";

/**
 * Structural database-boundary check.
 *
 * This is a diagnostic predicate, NOT proof of
 * authenticated database provenance or payment authority.
 */
export function hasV3ServerOwnedLocalDatabaseBoundary({
  storefrontConnection,
  sandboxConnection,
  orderModelConnection
} = {}) {
  return Boolean(
    storefrontConnection &&
    sandboxConnection &&
    storefrontConnection !== sandboxConnection &&
    storefrontConnection.readyState === 1 &&
    sandboxConnection.readyState === 1 &&
    storefrontConnection.db?.databaseName === "signavi_store" &&
    sandboxConnection.db?.databaseName ===
      "signavi_shipping_v3_dev" &&
    orderModelConnection === storefrontConnection
  );
}

/**
 * Construct the two local read-only evidence readers.
 *
 * No caller configuration is accepted. Database handles
 * and reader callbacks are obtained inside this module.
 *
 * No ownership or payment authority is granted here.
 */
export async function createV3ServerOwnedLocalEvidenceReaders() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox"
  ) {
    throw new Error("V3_SANDBOX_LOCAL_REVIEW_REQUIRED");
  }

  const storefrontConnection = mongoose.connection;

  if (
    storefrontConnection.readyState !== 1 ||
    storefrontConnection.db?.databaseName !== "signavi_store" ||
    Order.db !== storefrontConnection
  ) {
    throw new Error("V3_STOREFRONT_AUTHORITY_REQUIRED");
  }

  const sandboxConnection = await getV3SandboxConnection();

  if (!hasV3ServerOwnedLocalDatabaseBoundary({
    storefrontConnection,
    sandboxConnection,
    orderModelConnection: Order.db
  })) {
    throw new Error("V3_LOCAL_DATABASE_BOUNDARY_REJECTED");
  }

  const readKnownHistory =
    createV3SandboxLocalHistoryReader({
      storefrontConnection,
      sandboxConnection
    });

  const readOwnership =
    createV3SandboxOwnershipSnapshotReader({
      storefrontConnection,
      sandboxConnection
    });

  if (
    typeof readKnownHistory !== "function" ||
    typeof readOwnership !== "function"
  ) {
    throw new Error("V3_LOCAL_READER_CONSTRUCTION_FAILED");
  }

  return Object.freeze({
    readKnownHistory,
    readOwnership
  });
}
