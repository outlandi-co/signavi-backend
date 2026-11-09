import { createHash } from "node:crypto"

export function createMongoStorefrontRecoveryCounter({
  collection,
  now = () => Date.now()
}) {
  if (
    !collection ||
    typeof collection.findOneAndUpdate !== "function" ||
    typeof now !== "function"
  ) {
    throw new Error("Shared recovery counter unavailable.")
  }

  return async function increment({ key, windowMs }) {
    if (
      typeof key !== "string" ||
      !key.trim() ||
      !Number.isSafeInteger(windowMs) ||
      windowMs < 1000
    ) {
      throw new Error("Invalid rate-limit input.")
    }

    const timestamp = now()

    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      throw new Error("Invalid counter timestamp.")
    }

    const bucket = Math.floor(timestamp / windowMs)
    const expiresAt = new Date((bucket + 1) * windowMs)

    const digest = createHash("sha256")
      .update("signavi-studio-recovery:v1:")
      .update(key)
      .digest("hex")

    const id = `${digest}:${windowMs}:${bucket}`

    const result = await collection.findOneAndUpdate(
      { _id: id },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt }
      },
      {
        upsert: true,
        returnDocument: "after"
      }
    )

    // The injected collection must use a MongoDB driver
    // returning the updated document directly.
    if (
      !result ||
      !Number.isSafeInteger(result.count) ||
      result.count < 1
    ) {
      throw new Error("Atomic counter result unavailable.")
    }

    return { count: result.count }
  }
}
