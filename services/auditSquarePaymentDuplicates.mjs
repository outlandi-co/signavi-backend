const FIELDS = [
  "squareOrderId",
  "squarePaymentId"
];

// Read-only aggregate operations only.
// Returns duplicate-group counts, not payment identifiers.
// No connection, index creation, updates, or deletes.
export async function auditSquarePaymentDuplicates({
  collection
} = {}) {
  if (
    !collection ||
    typeof collection.aggregate !== "function"
  ) {
    throw new Error("SQUARE_AUDIT_COLLECTION_REQUIRED");
  }

  const result = {};

  for (const field of FIELDS) {
    const pipeline = [
      {
        $match: {
          [field]: {
            $type: "string",
            $gt: ""
          }
        }
      },
      {
        $group: {
          _id: `$${field}`,
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      },
      {
        $count: "duplicateGroups"
      }
    ];

    const cursor = collection.aggregate(pipeline);
    const rows = await cursor.toArray();

    if (
      !Array.isArray(rows) ||
      rows.length > 1 ||
      (
        rows.length === 1 &&
        (
          !Number.isSafeInteger(rows[0]?.duplicateGroups) ||
          rows[0].duplicateGroups < 1
        )
      )
    ) {
      throw new Error("INVALID_SQUARE_AUDIT_RESULT");
    }

    result[field] = rows[0]?.duplicateGroups ?? 0;
  }

  return Object.freeze(result);
}
