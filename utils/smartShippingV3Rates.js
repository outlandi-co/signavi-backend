const getRateCents = (rate) => {
  if (
    !rate?.object_id ||
    String(rate.currency || "").toUpperCase() !== "USD"
  ) {
    return null
  }

  const amount = String(rate.amount || "")

  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    return null
  }

  const [dollars, cents = ""] = amount.split(".")
  const total =
    Number(dollars) * 100 +
    Number(cents.padEnd(2, "0"))

  return Number.isSafeInteger(total) && total > 0
    ? total
    : null
}

const getServiceKey = (rate) => {
  const provider = String(rate.provider || "").trim()
  const account = String(rate.carrier_account || "").trim()
  const service = String(rate.servicelevel?.token || "").trim()

  return provider && account && service
    ? JSON.stringify([provider, account, service])
    : null
}

export const combineV3ParcelRates = (shipments) => {
  if (!Array.isArray(shipments) || shipments.length === 0) {
    return []
  }

  let common = null

  for (const shipment of shipments) {
    const available = new Map()

    for (const rate of shipment?.rates || []) {
      const cents = getRateCents(rate)
      const key = getServiceKey(rate)

      if (!key || cents === null) continue

      const previous = available.get(key)

      if (!previous || cents < previous.cents) {
        available.set(key, { rate, cents })
      }
    }

    if (common === null) {
      common = new Map(
        [...available.entries()].map(([key, item]) => [
          key,
          [item]
        ])
      )
      continue
    }

    for (const [key, items] of common) {
      const next = available.get(key)

      if (!next) {
        common.delete(key)
      } else {
        items.push(next)
      }
    }
  }

  return [...(common || new Map()).values()]
    .map((items) => {
      const totalCents = items.reduce(
        (sum, item) => sum + item.cents,
        0
      )

      if (!Number.isSafeInteger(totalCents)) {
        return null
      }

      return {
        ...items[0].rate,
        amount: (totalCents / 100).toFixed(2),
        parcelRateIds: items.map(
          (item) => item.rate.object_id
        ),
        parcelRates: items.map(
          (item) => item.rate
        )
      }
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.amount) - Number(b.amount))
}