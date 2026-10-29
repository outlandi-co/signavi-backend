const objectIdPattern = /^[0-9a-f]{24}$/

const result = (status, reason) => Object.freeze({
  status,
  reason,
  retryAuthorized: false
})

/**
 * Dependency-injected checkout-link execution.
 *
 * Not connected to a production route or Square SDK.
 *
 * claimAttempt MUST atomically persist the one-time claim
 * before returning claimed=true. Its implementation is
 * responsible for cross-process and cross-restart safety.
 *
 * createLink MUST be a trusted server-side adapter.
 * persistLink MUST durably record the returned link.
 * holdUncertain MUST persist the uncertain outcome.
 *
 * No MongoDB transaction may remain open during createLink.
 */
export async function runV3ProductionCheckoutLinkWorkflow({
  orderId,
  purchaseKey,
  amountCents,
  owner,
  claimAttempt,
  createLink,
  persistLink,
  holdUncertain
} = {}) {
  const id = String(orderId || "").toLowerCase()
  const expectedKey = `signavi-v3-production-purchase-${id}`

  if (
    !objectIdPattern.test(id) ||
    purchaseKey !== expectedKey ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1 ||
    typeof owner !== "string" ||
    !owner.trim()
  ) {
    return result("blocked", "INVALID_TRUSTED_CHECKOUT_IDENTITY")
  }

  if (
    typeof claimAttempt !== "function" ||
    typeof createLink !== "function" ||
    typeof persistLink !== "function" ||
    typeof holdUncertain !== "function"
  ) {
    return result("blocked", "TRUSTED_DEPENDENCY_REQUIRED")
  }

  const identity = Object.freeze({
    orderId: id,
    environment: "production",
    purchaseKey,
    idempotencyKey: purchaseKey,
    amountCents,
    owner
  })

  let claim

  try {
    claim = await claimAttempt(identity)
  } catch {
    // The claim outcome may be uncertain.
    // Never create a link or automatically retry.
    return result("blocked", "CLAIM_OUTCOME_UNCERTAIN")
  }

  if (
    claim?.claimed !== true ||
    claim.orderId !== id ||
    claim.idempotencyKey !== purchaseKey ||
    claim.owner !== owner
  ) {
    return result("blocked", "DURABLE_CLAIM_NOT_VERIFIED")
  }

  // After a durable claim, every failure must be held.
  // The same purchase must never blindly create again.
  const hold = async reason => {
    try {
      await holdUncertain({
        ...identity,
        reason
      })
    } catch {
      return result("reconciliation_required", "RECONCILIATION_WRITE_UNCERTAIN")
    }

    return result("reconciliation_required", reason)
  }

  let link

  try {
    link = await createLink(identity)
  } catch {
    return hold("SQUARE_CREATION_OUTCOME_UNCERTAIN")
  }

  if (
    !link ||
    typeof link.paymentLinkId !== "string" ||
    !link.paymentLinkId.trim() ||
    typeof link.squareOrderId !== "string" ||
    !link.squareOrderId.trim() ||
    typeof link.paymentUrl !== "string" ||
    !/^https:\/\//i.test(link.paymentUrl)
  ) {
    return hold("SQUARE_LINK_EVIDENCE_INVALID")
  }

  try {
    const recorded = await persistLink({
      ...identity,
      paymentLinkId: link.paymentLinkId,
      squareOrderId: link.squareOrderId,
      paymentUrl: link.paymentUrl
    })

    if (recorded?.recorded !== true) {
      return hold("PAYMENT_LINK_RECORDING_UNCONFIRMED")
    }
  } catch {
    return hold("PAYMENT_LINK_RECORDING_UNCERTAIN")
  }

  return Object.freeze({
    status: "link_recorded",
    reason: "PAYMENT_LINK_DURABLY_RECORDED",
    paymentUrl: link.paymentUrl,
    retryAuthorized: false
  })
}