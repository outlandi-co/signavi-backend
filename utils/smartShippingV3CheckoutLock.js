import crypto from "node:crypto"
import mongoose from "mongoose"

const LOCK_MS = 2 * 60 * 1000

const checkoutLockSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  owner: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  versionKey: false,
  collection: "smart_shipping_v3_checkout_locks"
})

const CheckoutLock =
  mongoose.models.SmartShippingV3CheckoutLock ||
  mongoose.model(
    "SmartShippingV3CheckoutLock",
    checkoutLockSchema
  )

export const acquireV3CheckoutLock = async (orderId) => {
  const id = String(orderId || "")

  if (!mongoose.isValidObjectId(id)) {
    throw new Error("Invalid V3 checkout order ID.")
  }

  const owner = crypto.randomUUID()
  const now = new Date()

  const expiresAt = new Date(now.getTime() + LOCK_MS)

  try {
    await CheckoutLock.create({
      _id: new mongoose.Types.ObjectId(id),
      owner,
      expiresAt
    })

    return { orderId: id, owner, expiresAt }
  } catch (error) {
    if (error?.code === 11000) {
      return null
    }

    throw error
  }
}

export const releaseV3CheckoutLock = async (lock) => {
  if (!lock?.orderId || !lock?.owner) {
    return false
  }

  const result = await CheckoutLock.deleteOne({
    _id: lock.orderId,
    owner: lock.owner
  })

  return result.deletedCount === 1
}
/* ===== ISOLATED V3 SANDBOX CHECKOUT LOCK ===== */

const requireSandboxCheckoutLock = (CheckoutLock) => {
  if (
    !CheckoutLock ||
    CheckoutLock.db === mongoose.connection ||
    CheckoutLock.db?.readyState !== 1 ||
    CheckoutLock.db?.db?.databaseName !==
      "signavi_shipping_v3_dev"
  ) {
    throw new Error("V3_SANDBOX_CHECKOUT_LOCK_ISOLATION_REQUIRED");
  }

  return CheckoutLock;
};

export const acquireV3IsolatedCheckoutLock = async (
  orderId,
  { CheckoutLock } = {}
) => {
  const Model = requireSandboxCheckoutLock(CheckoutLock);
  const id = String(orderId || "").toLowerCase();

  if (!mongoose.isValidObjectId(id)) {
    throw new Error("Invalid V3 sandbox checkout order ID.");
  }

  const owner = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + LOCK_MS);

  try {
    await Model.create({
      _id: new mongoose.Types.ObjectId(id),
      owner,
      expiresAt
    });

    return { orderId: id, owner, expiresAt };
  } catch (error) {
    if (error?.code === 11000) {
      return null;
    }

    throw error;
  }
};

export const releaseV3IsolatedCheckoutLock = async (
  lock,
  { CheckoutLock } = {}
) => {
  const Model = requireSandboxCheckoutLock(CheckoutLock);

  if (!lock?.orderId || !lock?.owner) {
    return false;
  }

  const result = await Model.deleteOne({
    _id: lock.orderId,
    owner: lock.owner
  });

  return result.deletedCount === 1;
};
