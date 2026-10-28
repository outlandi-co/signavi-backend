import {
  createV3ProductionOrderEvidenceReader
} from "./createV3ProductionOrderEvidenceReader.js"

import {
  createV3ProductionEvidenceBoundaryIsolated
} from "./createV3ProductionEvidenceBoundaryIsolated.js"

/**
 * Test-only composition of the production-shaped read-only
 * Square reader and the existing isolated recording boundary.
 *
 * This is not a production payment-recording entry point.
 */
export function createV3ProductionResolvedEvidenceBoundaryIsolated({
  testClient
} = {}) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("ISOLATED_TEST_ONLY")
  }

  if (!testClient) {
    throw new Error("TEST_SQUARE_CLIENT_REQUIRED")
  }

  const expectedLocationId =
    process.env.SQUARE_PRODUCTION_LOCATION_ID

  const reader = createV3ProductionOrderEvidenceReader({
    testClient
  })

  // Evidence provider is bound here, not by the recording request.
  const boundary = createV3ProductionEvidenceBoundaryIsolated({
    expectedLocationId,
    lookupSquareEvidence: ({ squareOrderId }) =>
      reader.readEvidence({ squareOrderId })
  })

  return Object.freeze({
    record: request => boundary.record(request)
  })
}
