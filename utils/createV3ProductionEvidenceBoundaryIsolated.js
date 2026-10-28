import {
  recordV3ProductionVerifiedEntryIsolated
} from "./recordV3ProductionVerifiedEntryIsolated.js"

/**
 * ISOLATED TEST ONLY.
 *
 * Provider and Square location are selected at factory creation.
 * Recording callers cannot replace either value.
 *
 * The injected provider is NOT authenticated by this factory.
 * Production integration must internally own Square credentials,
 * client construction, and lookup operations.
 */
export function createV3ProductionEvidenceBoundaryIsolated({
  lookupSquareEvidence,
  expectedLocationId
} = {}) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("ISOLATED_TEST_ONLY")
  }

  if (
    typeof lookupSquareEvidence !== "function" ||
    typeof expectedLocationId !== "string" ||
    !expectedLocationId.trim()
  ) {
    throw new Error("SERVER_EVIDENCE_PROVIDER_REQUIRED")
  }

  const boundLookup = lookupSquareEvidence
  const boundLocation = expectedLocationId

  return Object.freeze({
    async record({
      orderId,
      connection,
      Order,
      Reservation,
      PaymentOperation
    } = {}) {
      if (process.env.NODE_ENV !== "test") {
        throw new Error("ISOLATED_TEST_ONLY")
      }

      return recordV3ProductionVerifiedEntryIsolated({
        orderId,
        connection,
        Order,
        Reservation,
        PaymentOperation,
        expectedLocationId: boundLocation,
        lookupSquareEvidence: boundLookup
      })
    }
  })
}
