import mongoose from "mongoose";

const DATABASE_NAME = "signavi_shipping_v3_dev";

let sandboxConnectionPromise = null;

export async function getV3SandboxConnection() {
  if (
    !["development", "test"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    process.env.SMART_SHIPPING_V3_ENABLED !== "true"
  ) {
    throw new Error("V3_SANDBOX_DATABASE_DISABLED");
  }

  const uri = process.env.V3_SANDBOX_MONGO_URI;

  if (!uri) {
    throw new Error("V3_SANDBOX_DATABASE_NOT_CONFIGURED");
  }

  let databaseName;

  try {
    databaseName = decodeURIComponent(
      new URL(uri).pathname.replace(/^\/+/, "")
    );
  } catch {
    throw new Error("V3_SANDBOX_DATABASE_INVALID_URI");
  }

  if (databaseName !== DATABASE_NAME) {
    throw new Error("V3_SANDBOX_DATABASE_NAME_MISMATCH");
  }

  if (!sandboxConnectionPromise) {
    sandboxConnectionPromise = (async () => {
      const connection = mongoose.createConnection(uri, {
        serverSelectionTimeoutMS: 5000
      });

      try {
        await connection.asPromise();

        if (
          connection.readyState !== 1 ||
          connection.db?.databaseName !== DATABASE_NAME ||
          connection === mongoose.connection
        ) {
          throw new Error("V3_SANDBOX_DATABASE_ISOLATION_FAILED");
        }

        return connection;
      } catch (error) {
        await connection.close().catch(() => {});
        throw error;
      }
    })().catch(error => {
      sandboxConnectionPromise = null;
      throw error;
    });
  }

  return sandboxConnectionPromise;
}
