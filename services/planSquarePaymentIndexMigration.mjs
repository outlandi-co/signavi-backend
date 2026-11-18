import {
  verifySquarePaymentIndexes
} from "./verifySquarePaymentIndexes.js";

const FIELDS = ["squareOrderId", "squarePaymentId"];

const DENIED = reason => ({
  safe: false,
  action: "stop",
  reason,
  mayCreateIndex: false,
  mayExecutePayment: false
});

function specification(field) {
  return {
    name: `unique_${field}_nonempty_v1`,
    key: { [field]: 1 },
    unique: true,
    partialFilterExpression: {
      [field]: {
        $type: "string",
        $gt: ""
      }
    }
  };
}

function isExpectedIndex(index, field) {
  if (!index || typeof index !== "object") return false;

  const key = index.key;
  const partial = index.partialFilterExpression;

  return (
    index.unique === true &&
    index.hidden !== true &&
    index.sparse !== true &&
    key &&
    typeof key === "object" &&
    Object.keys(key).length === 1 &&
    key[field] === 1 &&
    partial &&
    typeof partial === "object" &&
    Object.keys(partial).length === 1 &&
    partial[field] &&
    typeof partial[field] === "object" &&
    Object.keys(partial[field]).length === 2 &&
    partial[field].$type === "string" &&
    partial[field].$gt === "" &&
    (
      index.collation == null ||
      (
        index.collation.locale === "simple" &&
        Object.keys(index.collation).length === 1
      )
    )
  );
}

// Planning only. Callbacks must be read-only.
// Never creates indexes, changes orders, or connects to MongoDB.
export async function planSquarePaymentIndexMigration({
  listIndexes,
  auditDuplicates
} = {}) {
  if (
    typeof listIndexes !== "function" ||
    typeof auditDuplicates !== "function"
  ) {
    return DENIED("readers-unavailable");
  }

  let indexes;
  let duplicates;

  try {
    indexes = await listIndexes();
    duplicates = await auditDuplicates();
  } catch {
    return DENIED("inspection-failed");
  }

  if (
    !Array.isArray(indexes) ||
    indexes.some(index =>
      !index ||
      typeof index !== "object" ||
      !index.key ||
      typeof index.key !== "object" ||
      Array.isArray(index.key)
    )
  ) {
    return DENIED("invalid-index-catalog");
  }

  if (
    !duplicates ||
    typeof duplicates !== "object" ||
    Array.isArray(duplicates) ||
    FIELDS.some(field =>
      !Number.isSafeInteger(duplicates[field]) ||
      duplicates[field] < 0
    )
  ) {
    return DENIED("invalid-duplicate-audit");
  }

  const duplicateCounts = Object.fromEntries(
    FIELDS.map(field => [field, duplicates[field]])
  );

  if (FIELDS.some(field => duplicateCounts[field] > 0)) {
    return {
      ...DENIED("duplicate-square-identifiers"),
      duplicateCounts
    };
  }

  const proposedIndexes = [];

  for (const field of FIELDS) {
    const expected = specification(field);

    const relevant = indexes.filter(index =>
      Object.prototype.hasOwnProperty.call(index.key, field) ||
      index.name === expected.name
    );

    // A legacy ordinary index on squareOrderId is a conflict,
    // not permission to drop or replace that index.
    if (relevant.some(index => !isExpectedIndex(index, field))) {
      return {
        ...DENIED("index-conflict"),
        field,
        duplicateCounts
      };
    }

    if (relevant.length > 1) {
      return {
        ...DENIED("multiple-index-definitions"),
        field,
        duplicateCounts
      };
    }

    if (relevant.length === 0) {
      proposedIndexes.push(expected);
    }
  }

  const readiness = verifySquarePaymentIndexes(indexes);

  if (readiness.ready && proposedIndexes.length === 0) {
    return {
      safe: true,
      action: "none",
      reason: "indexes-ready",
      mayCreateIndex: false,
      mayExecutePayment: false,
      duplicateCounts
    };
  }

  return {
    safe: true,
    action: "manual-migration-required",
    reason: "indexes-missing",
    mayCreateIndex: false,
    mayExecutePayment: false,
    duplicateCounts,
    proposedIndexes
  };
}
