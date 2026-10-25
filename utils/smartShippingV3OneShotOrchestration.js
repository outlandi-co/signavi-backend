import {
  acquireAndReserveV3Checkout
} from "./smartShippingV3AcquireAndReserve.js"

import {
  runV3TrustedSandboxExecution,
  runV3TrustedSandboxExecutionForTests
} from "./smartShippingV3TrustedExecution.js"

// This module does not grant launch authorization.
// Exact-order approval and fixture validation remain
// mandatory in the controlled one-shot launcher.

const coordinateAndExecute = async ({
  orderId,
  execute,
  expectedCheckoutReferenceId = null,
  expectedIdempotencyKey = null
}) => {
  // Once coordination begins, a lock or reservation may
  // persist. Never automatically release, reset, or retry.
  const reservation = await acquireAndReserveV3Checkout({
    orderId
  })

  if (
    reservation?.orderId !== orderId ||
    typeof reservation.owner !== "string" ||
    !reservation.owner ||
    reservation.requestReserved !== true ||
    reservation.squareRequestAuthorized !== false ||
    reservation.paymentCreated !== false ||
    !(reservation.expiresAt instanceof Date) ||
    reservation.expiresAt <= new Date()
  ) {
    throw new Error("V3 one-shot reservation invalid.")
  }

  // Compare against the payment identity captured
  // from the pending operation before coordination.
  // Never execute after an identity mismatch.
  if (
    (expectedCheckoutReferenceId !== null &&
      reservation.checkoutReferenceId !== expectedCheckoutReferenceId) ||
    (expectedIdempotencyKey !== null &&
      reservation.idempotencyKey !== expectedIdempotencyKey)
  ) {
    throw new Error("V3 one-shot payment identity mismatch.")
  }

  return execute({
    orderId,
    owner: reservation.owner
  })
}

// Real entry point: trusted SDK only.
// Never accepts caller-provided SDK objects.
export const runV3OneShotTrustedExecution = ({
  orderId,
  expectedCheckoutReferenceId,
  expectedIdempotencyKey
}) => {
  if (
    typeof expectedCheckoutReferenceId !== "string" ||
    !expectedCheckoutReferenceId ||
    typeof expectedIdempotencyKey !== "string" ||
    !expectedIdempotencyKey
  ) {
    throw new Error("V3 one-shot payment identity required.")
  }

  return coordinateAndExecute({
    orderId,
    execute: runV3TrustedSandboxExecution,
    expectedCheckoutReferenceId,
    expectedIdempotencyKey
  })
}

// Mock-only integration-test entry point.
// Never expose this through an HTTP route.
export const runV3OneShotExecutionForTests = ({
  orderId,
  sdk
}) => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("V3 one-shot SDK injection is test-only.")
  }

  return coordinateAndExecute({
    orderId,
    execute: ({ orderId, owner }) =>
      runV3TrustedSandboxExecutionForTests({
        orderId,
        owner,
        sdk
      })
  })
}