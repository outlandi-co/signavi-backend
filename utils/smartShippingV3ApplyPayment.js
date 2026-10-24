export const applyV3PreparedPayment = (order, prepared) => {
  if (
    !order ||
    !prepared ||
    String(order._id) !== prepared.orderId ||
    !Number.isSafeInteger(prepared.totalCents) ||
    prepared.totalCents <= 0 ||
    !Number.isSafeInteger(prepared.shippingAmountCents) ||
    prepared.shippingAmountCents <= 0 ||
    !Number.isSafeInteger(prepared.subtotalCents) ||
    prepared.subtotalCents < 0 ||
    !Number.isSafeInteger(prepared.taxCents) ||
    prepared.taxCents < 0 ||
    prepared.totalCents !==
      prepared.subtotalCents +
      prepared.taxCents +
      prepared.shippingAmountCents ||
    !Array.isArray(prepared.parcelRateIds) ||
    prepared.parcelRateIds.length < 1 ||
    prepared.parcelRateIds.length > 10 ||
    new Set(prepared.parcelRateIds).size !==
      prepared.parcelRateIds.length ||
    !["USPS", "UPS"].includes(prepared.carrier) ||
    typeof prepared.serviceToken !== "string" ||
    !prepared.serviceToken.startsWith(
      prepared.carrier.toLowerCase() + "_"
    )
  ) {
    throw new Error("Invalid prepared V3 payment.")
  }

  const amount = prepared.shippingAmountCents / 100

  order.shipping = amount
  order.shippingCost = amount
  order.shippingTotal = amount
  order.deliveryFee = amount

  order.subtotal = prepared.subtotalCents / 100
  order.tax = prepared.taxCents / 100
  order.finalPrice = prepared.totalCents / 100

  order.shippingRateId = prepared.parcelRateIds[0]
  order.shippingRateIds = [...prepared.parcelRateIds]
  order.shippingProvider = prepared.carrier
  order.shippingService = prepared.serviceToken

  order.shippingRate = {
    object_id: prepared.parcelRateIds[0],
    rateIds: [...prepared.parcelRateIds],
    amount: amount.toFixed(2),
    currency: "USD",
    provider: prepared.carrier,
    servicelevel: {
      name: prepared.serviceToken
    },
    version: 3
  }

  return order
}

export const verifyV3AppliedPayment = (order, prepared) => {
  if (!order || !prepared) return false

  const toCents = (value) => {
    const n = Number(value)
    return Number.isFinite(n)
      ? Math.round(n * 100)
      : NaN
  }

  return (
    String(order._id) === prepared.orderId &&
    toCents(order.subtotal) === prepared.subtotalCents &&
    toCents(order.tax) === prepared.taxCents &&
    toCents(order.shipping) === prepared.shippingAmountCents &&
    toCents(order.finalPrice) === prepared.totalCents &&
    Array.isArray(order.shippingRateIds) &&
    JSON.stringify(order.shippingRateIds) ===
      JSON.stringify(prepared.parcelRateIds)
  )
}