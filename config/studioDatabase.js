import mongoose from "mongoose";

export const STUDIO_DATABASE_NAME = "signavi_studio";

let studioConnection = null;

export async function connectStudioDatabase() {
  if (studioConnection?.readyState === 1) {
    return studioConnection;
  }

  if (mongoose.connection.readyState !== 1) {
    throw new Error(
      "STUDIO_DATABASE_UNAVAILABLE: primary MongoDB connection is not ready"
    );
  }

  const connection = mongoose.connection.useDb(
    STUDIO_DATABASE_NAME,
    { useCache: true, noListener: false }
  );

  await connection.db.admin().ping();

  if (connection.name !== STUDIO_DATABASE_NAME) {
    throw new Error("STUDIO_DATABASE_MISMATCH");
  }

  studioConnection = connection;

  return studioConnection;
}

export function getStudioDatabase() {
  if (!studioConnection || studioConnection.readyState !== 1) {
    throw new Error("STUDIO_DATABASE_NOT_CONNECTED");
  }

  if (studioConnection.name !== STUDIO_DATABASE_NAME) {
    throw new Error("STUDIO_DATABASE_MISMATCH");
  }

  return studioConnection;
}