const serviceGroups = {
  standard: new Set([
    "usps_ground_advantage",
    "ups_ground",
    "ups_ground_saver"
  ]),
  expedited: new Set([
    "usps_priority",
    "usps_priority_express",
    "ups_3_day_select",
    "ups_second_day_air",
    "ups_second_day_air_am",
    "ups_next_day_air",
    "ups_next_day_air_saver",
    "ups_next_day_air_early_am"
  ])
}

// Use explicit carrier/service tokens, not display-name guesses.
// Tokens must be confirmed against Shippo responses before
// these choices are offered to customers.

export const selectV3ShippingOptions = (
  rates,
  expectedParcelCount
) => {
  if (
    !Array.isArray(rates) ||
    !Number.isInteger(expectedParcelCount) ||
    expectedParcelCount < 1
  ) {
    return []
  }

  const options = []

  for (const [category, tokens] of Object.entries(serviceGroups)) {
    const eligible = rates.filter((rate) => {
      const token = String(rate?.servicelevel?.token || "")
        .trim()
        .toLowerCase()

      const ids = rate?.parcelRateIds
      const amount = Number(rate?.amount)

      return (
        tokens.has(token) &&
        Array.isArray(ids) &&
        ids.length === expectedParcelCount &&
        ids.every((id) => typeof id === "string" && id.length > 0) &&
        new Set(ids).size === ids.length &&
        String(rate.currency || "").toUpperCase() === "USD" &&
        Number.isFinite(amount) &&
        amount > 0
      )
    })

    eligible.sort((a, b) => Number(a.amount) - Number(b.amount))

    if (eligible.length === 0) continue

    const selected = eligible[0]

    options.push({
      category,
      label: category === "standard"
        ? "Standard Shipping"
        : "Expedited Shipping",
      carrier: selected.provider,
      service: selected.servicelevel?.name || "",
      serviceToken: selected.servicelevel.token,
      amount: selected.amount,
      currency: selected.currency,
      parcelCount: expectedParcelCount,
      parcelRateIds: [...selected.parcelRateIds]
    })
  }

  return options
}