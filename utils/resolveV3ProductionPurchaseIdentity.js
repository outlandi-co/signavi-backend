const objectId = /^[0-9a-f]{24}$/i

const normalizeId = value => {
  if (typeof value !== "string" || !objectId.test(value)) {
    throw new Error("INVALID_DOCUMENT_ID")
  }

  return value.toLowerCase()
}

/**
 * Resolves a canonical production purchase identity.
 *
 * loadOrder and loadAssociation must be trusted, server-side
 * read-only persistence functions.
 *
 * This function does not authorize payment creation.
 */
export async function resolveV3ProductionPurchaseIdentity({
  documentType,
  documentId,
  orderId,
  loadOrder,
  loadAssociation
}) {
  if (!["order", "invoice"].includes(documentType)) {
    throw new Error("INVALID_DOCUMENT_TYPE")
  }

  if (
    typeof loadOrder !== "function" ||
    typeof loadAssociation !== "function"
  ) {
    throw new Error("TRUSTED_LOOKUPS_REQUIRED")
  }

  const canonicalOrderId = normalizeId(orderId)
  const canonicalDocumentId = normalizeId(documentId)

  const order = await loadOrder(canonicalOrderId)

  if (
    !order ||
    normalizeId(String(order._id)) !== canonicalOrderId ||
    order.squareEnvironment !== "production"
  ) {
    throw new Error("PRODUCTION_ORDER_NOT_VERIFIED")
  }

  if (documentType === "order") {
    if (canonicalDocumentId !== canonicalOrderId) {
      throw new Error("ORDER_IDENTITY_MISMATCH")
    }
  } else {
    const association = await loadAssociation({
      orderId: canonicalOrderId,
      invoiceId: canonicalDocumentId,
      environment: "production"
    })

    if (
      !association ||
      normalizeId(String(association.orderId)) !== canonicalOrderId ||
      normalizeId(String(association.invoiceId)) !== canonicalDocumentId ||
      association.environment !== "production"
    ) {
      throw new Error("PRODUCTION_ASSOCIATION_NOT_VERIFIED")
    }
  }

  return Object.freeze({
    environment: "production",
    orderId: canonicalOrderId,
    documentType,
    documentId: canonicalDocumentId,
    purchaseKey: `signavi-v3-production-purchase-${canonicalOrderId}`
  })
}
