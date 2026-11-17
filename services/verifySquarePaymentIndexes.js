const FIELDS = [
  "squareOrderId",
  "squarePaymentId"
];

export function verifySquarePaymentIndexes(indexes = []) {
  if (!Array.isArray(indexes)) {
    throw new Error("INVALID_SQUARE_INDEX_CATALOG");
  }

  const result = {};

  for (const field of FIELDS) {
    const matching = indexes.filter(index =>
      index?.unique === true &&
      index?.key?.[field] === 1 &&
      Object.keys(index.key).length === 1 &&
      index?.partialFilterExpression?.[field]?.$type === "string" &&
      index?.partialFilterExpression?.[field]?.$gt === ""
    );

    result[field] = matching.length === 1;
  }

  return Object.freeze({
    ready: FIELDS.every(field => result[field]),
    fields: Object.freeze(result)
  });
}
