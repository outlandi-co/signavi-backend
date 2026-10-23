import {
  verifyV3SquareCheckoutAssociation
} from "./smartShippingV3SquareAssociation.js"

// Read-only Square lookup.
//
// The caller must supply a trusted Sandbox client
// and expectations from persisted SignaVi records.
//
// The client is injected for deterministic tests.
// No payment creation, lock release, or DB writes.
//
// A verified link is NOT evidence that a buyer paid.

export const lookupV3SquarePaymentLink = async ({
  client,
  expectedPaymentLinkId,
  expectedAmountCents,
  expectedReferenceId
}) => {
  if (
    !client ||
    typeof client.checkout?.paymentLinks?.get !== "function" ||
    typeof client.orders?.get !== "function"
  ) {
    throw new Error("Invalid V3 Square lookup client.")
  }

  if (
    typeof expectedPaymentLinkId !== "string" ||
    !expectedPaymentLinkId.trim() ||
    !Number.isSafeInteger(expectedAmountCents) ||
    expectedAmountCents <= 0 ||
    typeof expectedReferenceId !== "string" ||
    !expectedReferenceId.trim()
  ) {
    throw new Error("Invalid V3 Square lookup expectations.")
  }

  const linkResponse =
    await client.checkout.paymentLinks.get({
      id: expectedPaymentLinkId
    })

  const paymentLink =
    linkResponse?.paymentLink ??
    linkResponse?.payment_link

  if (
    paymentLink?.id !== expectedPaymentLinkId ||
    typeof paymentLink?.orderId !== "string" &&
    typeof paymentLink?.order_id !== "string"
  ) {
    throw new Error("Square payment-link lookup mismatch.")
  }

  const orderId =
    paymentLink.orderId ?? paymentLink.order_id

  if (!orderId || !orderId.trim()) {
    throw new Error("Square payment-link has no order.")
  }

  const orderResponse = await client.orders.get({
    orderId
  })

  const squareOrder =
    orderResponse?.order

  return verifyV3SquareCheckoutAssociation({
    expectedPaymentLinkId,
    expectedAmountCents,
    expectedReferenceId,
    paymentLink: {
      ...paymentLink,
      orderId
    },
    squareOrder
  })
}