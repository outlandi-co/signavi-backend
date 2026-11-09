export const createV3StorefrontTrustedShipments = ({
  buildParcels,
  requestRates,
  getPackages,
  getShipFrom,
  getDestination,
  getToken
}) => {
  const dependencies = [
    buildParcels,
    requestRates,
    getPackages,
    getShipFrom,
    getDestination,
    getToken
  ]

  if (dependencies.some(fn => typeof fn !== "function")) {
    throw new Error("Trusted shipping dependencies are required.")
  }

  return async order => {
    if (
      !order ||
      !Array.isArray(order.items) ||
      order.items.length < 1 ||
      !order.address
    ) {
      throw new Error("Invalid saved shipping order.")
    }

    // STUDIO_058H26_TRUSTED_STOREFRONT
    // Never infer a Studio order from a Store default.
    const storefront = order.storefront

    if (
      storefront !== "signavi_store" &&
      storefront !== "signavi_studio"
    ) {
      throw new Error("Invalid saved-order storefront.")
    }

    // Reject explicitly conflicting item storefronts.
    if (order.items.some(item =>
      item?.storefront !== undefined &&
      item.storefront !== storefront
    )) {
      throw new Error("Saved order contains conflicting storefronts.")
    }

    const items = order.items.map(item => ({
      productId: String(item?.productId || ""),
      quantity: item?.quantity
    }))

    const to = getDestination({
      name: order.customerName,
      street1: order.address.street,
      street: order.address.street,
      city: order.address.city,
      state: order.address.state,
      zip: order.address.zip,
      country: order.address.country
    })

    if (!to) {
      throw new Error("Invalid saved shipping destination.")
    }

    const packages = await getPackages()
    const from = getShipFrom()
    const token = getToken()

    if (
      !Array.isArray(packages) ||
      packages.length === 0 ||
      !from ||
      !token
    ) {
      throw new Error("Shipping provider is not configured.")
    }

    const plan = await buildParcels(
      items,
      packages,
      storefront
    )

    if (
      plan?.error ||
      !Array.isArray(plan?.parcels) ||
      plan.parcels.length < 1 ||
      plan.parcels.length > 10
    ) {
      throw new Error(
        plan?.error || "Invalid saved-order parcel plan."
      )
    }

    const shipments = []

    for (const parcel of plan.parcels) {
      const shipment = await requestRates({
        from,
        to,
        parcels: [parcel],
        token
      })

      if (
        !shipment ||
        !Array.isArray(shipment.rates) ||
        shipment.rates.length === 0
      ) {
        const messages = Array.isArray(shipment?.messages)
          ? shipment.messages
          : []

        const safeCategory = value => {
          const field = String(value?.source || "").toLowerCase()

          if (field === "carrier") return "carrier"
          if (field === "shippo") return "shippo"
          if (field === "address") return "address"
          if (field === "parcel") return "parcel"

          return "unspecified"
        }

        console.error("V3 SHIPPO EMPTY RATE DIAGNOSTIC:", {
  rateCount: Array.isArray(shipment?.rates)
    ? shipment.rates.length
    : 0,
  messageCount: messages.length,
  messageDescriptions: messages.slice(0, 10).map(message => ({
  code: String(message?.code || "").slice(0, 40),
  source: String(message?.source || "").slice(0, 40),
  text: String(message?.text || "")
    .replace(/\b(?:shippo_(?:test|live)_[A-Za-z0-9_-]+)\b/g, "[REDACTED]")
    .slice(0, 1200)
})),
  parcelCount: plan.parcels.length,
  categories: messages.map(safeCategory).slice(0, 10)
})

        throw new Error("Incomplete carrier shipment rates.")
      }

      shipments.push(shipment)
    }

    return shipments
  }
}