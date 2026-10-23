/**
 * Verify that a retrieved Square order belongs to
 * the expected Sandbox location.
 *
 * Pure validation only. No API calls or DB writes.
 * A matching location does not prove payment.
 */
export const verifyV3SquareOrderLocation = ({
  squareOrder,
  expectedLocationId
}) => {
  if (
    typeof expectedLocationId !== "string" ||
    !expectedLocationId.trim()
  ) {
    throw new Error("Missing trusted V3 Square location.")
  }

  const camelLocation = squareOrder?.locationId
  const snakeLocation = squareOrder?.location_id

  if (
    camelLocation !== undefined &&
    snakeLocation !== undefined &&
    camelLocation !== snakeLocation
  ) {
    throw new Error("Square order location mismatch.")
  }

  const locationId = camelLocation ?? snakeLocation

  if (
    typeof locationId !== "string" ||
    !locationId.trim()
  ) {
    throw new Error("Square order location missing.")
  }

  if (locationId !== expectedLocationId.trim()) {
    throw new Error("Square order location mismatch.")
  }

  return {
    locationVerified: true,
    locationId
  }
}