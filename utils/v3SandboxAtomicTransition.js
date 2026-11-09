import mongoose from "mongoose";

import {
  getV3SandboxConnection
} from "./v3SandboxDatabaseConnection.js";

import {
  getV3SandboxModels
} from "./v3SandboxModels.js";

const DATABASE_NAME = "signavi_shipping_v3_dev";
const LOCK_COLLECTION = "smart_shipping_v3_checkout_locks";

export async function runV3SandboxAtomicTransition({
  orderId,
  owner,
  transition,
  lockMustBeExpired = false
}) {
  if (
    typeof orderId !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(orderId) ||
    typeof owner !== "string" ||
    !owner.trim() ||
    typeof transition !== "function" ||
    typeof lockMustBeExpired !== "boolean"
  ) {
    throw new Error("V3_SANDBOX_TRANSITION_INVALID_INPUT");
  }

  const connection = await getV3SandboxConnection();

  if (
    connection === mongoose.connection ||
    connection.readyState !== 1 ||
    connection.db?.databaseName !== DATABASE_NAME
  ) {
    throw new Error("V3_SANDBOX_TRANSITION_ISOLATION_FAILED");
  }

  const models = getV3SandboxModels(connection);

  if (
    models.Order.db !== connection ||
    models.PaymentOperation.db !== connection
  ) {
    throw new Error("V3_SANDBOX_TRANSITION_MODEL_MISMATCH");
  }

  const session = await connection.startSession();

  try {
    return await session.withTransaction(async () => {
      const locks = connection.collection(LOCK_COLLECTION);

      const lockResult = await locks.updateOne(
        {
          _id: new mongoose.Types.ObjectId(orderId),
          owner,
          expiresAt: lockMustBeExpired
            ? { $lte: new Date() }
            : { $gt: new Date() }
        },
        {
          $inc: { ownershipChecks: 1 }
        },
        { session }
      );

      if (lockResult.matchedCount !== 1) {
        throw new Error(
          "V3_SANDBOX_TRANSITION_LOCK_NOT_OWNED"
        );
      }

      // Database operations only.
      // Never call Square inside this transaction.
      const result = await transition({
        session,
        connection,
        models
      });

      if (!result) {
        throw new Error(
          "V3_SANDBOX_TRANSITION_REJECTED"
        );
      }

      return result;
    });
  } finally {
    await session.endSession();
  }
}