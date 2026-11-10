import {
  createV3CrossDatabaseCheckoutModels
} from "./createV3CrossDatabaseCheckoutModels.js";

/**
 * Test-only cross-database transaction runner.
 *
 * Store and Sandbox must use the same MongoDB client.
 * The caller receives verified, explicitly bound models.
 *
 * Does not acquire a checkout lock or authorize Square.
 */
export async function runV3CrossDatabaseCheckoutTransition({
  storefrontConnection,
  sandboxConnection,
  transition
} = {}) {
  // Fail closed until real checkout integration is verified.
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox"
  ) {
    throw new Error("V3_CROSS_DATABASE_TRANSITION_TEST_ONLY");
  }

  if (typeof transition !== "function") {
    throw new Error("V3_TRANSITION_CALLBACK_REQUIRED");
  }

  const models = createV3CrossDatabaseCheckoutModels({
    storefrontConnection,
    sandboxConnection
  });

  const session = await storefrontConnection.startSession();

  let result;
  let completed = false;

  try {
    await session.withTransaction(
      async () => {
        result = await transition({
          session,
          models
        });

        if (
          result?.squareRequestAuthorized === true ||
          result?.paymentCreated === true
        ) {
          throw new Error(
            "V3_SQUARE_EXECUTION_NOT_AUTHORIZED"
          );
        }
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary"
      }
    );

    completed = true;
  } finally {
    await session.endSession();
  }

  if (!completed) {
    throw new Error("V3_TRANSACTION_NOT_COMMITTED");
  }

  return result;
}