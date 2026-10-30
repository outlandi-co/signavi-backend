const objectIdPattern = /^[0-9a-f]{24}$/

const deny = (reason, source = null) => Object.freeze({
  verified: false,
  noPriorPaymentActivity: false,
  knownRecordsClear: false,
  reason,
  source
})

/**
 * Checks known MongoDB payment evidence for one production order.
 *
 * IMPORTANT:
 * - No matching records does not prove no Square activity.
 * - This function NEVER authorizes a fresh payment.
 * - A trusted Square reconciliation process must independently
 *   establish whether any prior payment/link exists.
 * - Run before initializing a new V3 purchase identity.
 */
export async function checkV3KnownPaymentHistory({
  orderId,
  Order,
  SquareReservation,
  SharedPaymentReservation,
  ProductionReservation,
  PaymentOperation
} = {}) {
  const id = String(orderId || "").toLowerCase()

  if (!objectIdPattern.test(id)) {
    return deny("INVALID_ORDER_ID")
  }

  const repositories = {
    Order,
    SquareReservation,
    SharedPaymentReservation,
    ProductionReservation,
    PaymentOperation
  }

  for (const [name, repository] of Object.entries(repositories)) {
    if (typeof repository?.findOne !== "function") {
      return deny("PAYMENT_HISTORY_REPOSITORY_MISSING", name)
    }
  }

  try {
    const order = await Order.findOne({
      _id: id
    }).lean()

    if (!order) {
      return deny("ORDER_NOT_FOUND", "Order")
    }

    if (
      String(order.paymentStatus || "").toLowerCase() !== "unpaid" &&
      String(order.paymentStatus || "").toLowerCase() !== "pending" &&
      String(order.paymentStatus || "").toLowerCase() !== "payment_required"
    ) {
      return deny("ORDER_PAYMENT_STATUS_UNSAFE", "Order")
    }

    if (
      order.paymentUrl ||
      order.squarePaymentId ||
      order.squareOrderId ||
      order.squarePaymentLinkId ||
      order.paymentUrlCreatedAt
    ) {
      return deny("ORDER_HAS_PAYMENT_EVIDENCE", "Order")
    }

    const checks = [
      {
        name: "SquarePaymentCreationReservation",
        repository: SquareReservation,
        filter: {
          orderId: id,
          environment: "production"
        }
      },
      {
        name: "SharedSquarePaymentReservation",
        repository: SharedPaymentReservation,
        filter: {
          documentType: "order",
          documentId: id,
          environment: "production"
        }
      },
      {
        name: "SmartShippingV3ProductionPurchaseReservation",
        repository: ProductionReservation,
        filter: {
          orderId: id,
          environment: "production"
        }
      },
      {
        name: "SmartShippingV3PaymentOperation",
        repository: PaymentOperation,
        filter: {
          orderId: id
        }
      }
    ]

    // Sequential checks make the first detected conflict explicit.
    // Every matching record is treated as existing payment state,
    // regardless of its status.
    for (const check of checks) {
      const existing = await check.repository.findOne(
        check.filter
      ).lean()

      if (existing) {
        return deny(
          "EXISTING_PAYMENT_HISTORY_REQUIRES_RECONCILIATION",
          check.name
        )
      }
    }

    // MongoDB evidence is clear, but external Square history,
    // other legacy workflow sources, and race-free authorization
    // have NOT been established.
    return Object.freeze({
      verified: false,
      noPriorPaymentActivity: false,
      knownRecordsClear: true,
      reason: "EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED",
      source: "Square"
    })
  } catch {
    return deny("PAYMENT_HISTORY_READ_UNCERTAIN")
  }
}