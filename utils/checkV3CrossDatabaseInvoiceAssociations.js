import mongoose from "mongoose";

const blocked = reason => Object.freeze({
  clear: false,
  reason,
  squareRequestAuthorized: false
});

export async function checkV3CrossDatabaseInvoiceAssociations({
  orderId,
  storefrontConnection,
  sandboxConnection
} = {}) {
  const id = String(orderId ?? "").toLowerCase();

  if (!/^[0-9a-f]{24}$/.test(id)) {
    return blocked("INVALID_ORDER_ID");
  }

  if (
    storefrontConnection?.readyState !== 1 ||
    sandboxConnection?.readyState !== 1 ||
    storefrontConnection === sandboxConnection ||
    storefrontConnection.db?.databaseName !== "signavi_store" ||
    sandboxConnection.db?.databaseName !== "signavi_shipping_v3_dev"
  ) {
    return blocked("DATABASE_BOUNDARY_NOT_VERIFIED");
  }

  try {
    const orderObjectId = new mongoose.Types.ObjectId(id);

    const collections = [
      "invoice_order_associations_v3_test",
      "smart_shipping_v3_invoice_order_associations"
    ];

    for (const connection of [
      storefrontConnection,
      sandboxConnection
    ]) {
      for (const collectionName of collections) {
        const association = await connection
          .collection(collectionName)
          .findOne({ orderId: orderObjectId });

        if (association) {
          return blocked("INVOICE_ASSOCIATION_EXISTS");
        }
      }
    }

    return Object.freeze({
      clear: true,
      orderId: id,
      reason: "CHECKED_ASSOCIATION_COLLECTION_CLEAR_ONLY",
      squareRequestAuthorized: false
    });
  } catch {
    return blocked("INVOICE_ASSOCIATION_READ_UNCERTAIN");
  }
}