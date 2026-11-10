import mongoose from "mongoose";

export const STORE_DATABASE_NAME = "signavi_store";

let storeConnection = null;

export async function connectStoreDatabase() {
  if (storeConnection?.readyState === 1) {
    return storeConnection;
  }

  if (mongoose.connection.readyState !== 1) {
    throw new Error(
      "STORE_DATABASE_UNAVAILABLE: primary MongoDB connection is not ready"
    );
  }

  const connection = mongoose.connection.useDb(
    STORE_DATABASE_NAME,
    { useCache: true, noListener: false }
  );

  if (
    connection.name !== STORE_DATABASE_NAME ||
    connection.readyState !== 1
  ) {
    throw new Error("STORE_DATABASE_MISMATCH");
  }

  await connection.db.command({ ping: 1 });

  storeConnection = connection;

  return storeConnection;
}

export function getStoreDatabase() {
  if (!storeConnection || storeConnection.readyState !== 1) {
    throw new Error("STORE_DATABASE_NOT_CONNECTED");
  }

  if (storeConnection.name !== STORE_DATABASE_NAME) {
    throw new Error("STORE_DATABASE_MISMATCH");
  }

  return storeConnection;
}