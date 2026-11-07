const INDEX_NAME = "unique_storefront_creation_attempt_v1"
const FIELD = "storefrontCreationAttemptKey"

const DENIED = Object.freeze({
  ready: false,
  mayCreateOrder: false,
  mayCreateIndex: false,
  mayExecutePayment: false
})

// Requires an already-installed MongoDB unique partial index.
// NEVER creates, modifies, or removes an index.
export async function verifyStorefrontAttemptIndexReadiness({
  listIndexes
} = {}) {
  if (typeof listIndexes !== "function") {
    return DENIED
  }

  let indexes

  try {
    indexes = await listIndexes()
  } catch {
    return DENIED
  }

  if (!Array.isArray(indexes)) {
    return DENIED
  }

  const matches = indexes.filter(
    index => index?.name === INDEX_NAME
  )

  if (matches.length !== 1) {
    return DENIED
  }

  const index = matches[0]

  const key = index.key
  const partial = index.partialFilterExpression

  if (
    index.unique !== true ||
    index.hidden === true ||
    index.sparse === true ||
    !key ||
    typeof key !== "object" ||
    Array.isArray(key) ||
    Object.keys(key).length !== 1 ||
    key[FIELD] !== 1 ||
    !partial ||
    typeof partial !== "object" ||
    Array.isArray(partial) ||
    Object.keys(partial).length !== 1 ||
    !partial[FIELD] ||
    typeof partial[FIELD] !== "object" ||
    Array.isArray(partial[FIELD]) ||
    Object.keys(partial[FIELD]).length !== 1 ||
    partial[FIELD].$type !== "string" ||
    (
      index.collation != null &&
      (
        index.collation.locale !== "simple" ||
        Object.keys(index.collation).some(
          key => key !== "locale"
        )
      )
    )
  ) {
    return DENIED
  }

  return {
    ready: true,
    mayCreateOrder: false,
    mayCreateIndex: false,
    mayExecutePayment: false
  }
}