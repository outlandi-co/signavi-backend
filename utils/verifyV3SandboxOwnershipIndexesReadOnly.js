const blocked = reason => Object.freeze({
  verified: false,
  reason,
  exclusive: false,
  durable: false,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

const indexMatches = (indexes, expected) =>
  indexes.some(index => {
    if (!index || index.unique !== true) return false;

    if (
      index.sparse === true ||
      index.partialFilterExpression != null ||
      index.collation != null
    ) {
      return false;
    }

    const actual = index.key;

    if (!actual || typeof actual !== "object") {
      return false;
    }

    const keys = Object.keys(expected);

    return (
      Object.keys(actual).length === keys.length &&
      keys.every(key => actual[key] === expected[key])
    );
  });

export async function verifyV3SandboxOwnershipIndexesReadOnly({
  purchaseCollection,
  paymentCollection
} = {}) {
  if (
    typeof purchaseCollection?.listIndexes !== "function" ||
    typeof paymentCollection?.listIndexes !== "function"
  ) {
    return blocked("INDEX_COLLECTION_READER_INVALID");
  }

  let purchaseIndexes;
  let paymentIndexes;

  try {
    purchaseIndexes =
      await purchaseCollection.listIndexes().toArray();

    paymentIndexes =
      await paymentCollection.listIndexes().toArray();
  } catch {
    return blocked("MONGODB_INDEX_INSPECTION_FAILED");
  }

  if (
    !Array.isArray(purchaseIndexes) ||
    !Array.isArray(paymentIndexes)
  ) {
    return blocked("MONGODB_INDEX_RESPONSE_INVALID");
  }

  const required = [
    {
      indexes: purchaseIndexes,
      key: { environment: 1, purchaseKey: 1 },
      reason: "PURCHASE_KEY_UNIQUE_INDEX_MISSING"
    },
    {
      indexes: purchaseIndexes,
      key: {
        environment: 1,
        claimedByDocumentType: 1,
        claimedByDocumentId: 1
      },
      reason: "PURCHASE_DOCUMENT_UNIQUE_INDEX_MISSING"
    },
    {
      indexes: paymentIndexes,
      key: { orderId: 1 },
      reason: "PAYMENT_ORDER_UNIQUE_INDEX_MISSING"
    },
    {
      indexes: paymentIndexes,
      key: { idempotencyKey: 1 },
      reason: "PAYMENT_IDEMPOTENCY_UNIQUE_INDEX_MISSING"
    }
  ];

  for (const item of required) {
    if (!indexMatches(item.indexes, item.key)) {
      return blocked(item.reason);
    }
  }

  return Object.freeze({
    verified: true,
    reason: "REQUIRED_INDEX_DEFINITIONS_PRESENT",
    exclusive: false,
    durable: false,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}