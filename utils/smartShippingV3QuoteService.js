import axios from "axios"
import { combineV3ParcelRates } from "./smartShippingV3Rates.js"

const shippoUrl = "https://api.goshippo.com/shipments/"

export const quoteV3Parcels = async ({
  from,
  to,
  parcels,
  token,
  carrierAccountIds = [],
  requestShipment
}) => {
  if (
    !from || !to ||
    typeof from !== "object" ||
    typeof to !== "object" ||
    !Array.isArray(parcels) ||
    parcels.length < 1 ||
    parcels.length > 10
  ) {
    throw new Error("Invalid V3 shipment inputs.")
  }

  if (!Array.isArray(carrierAccountIds)) {
    throw new Error("Invalid carrier accounts.")
  }

  for (const parcel of parcels) {
    if (!parcel || typeof parcel !== "object") {
      throw new Error("Invalid parcel.")
    }

    // Flat Rate requires additional service compatibility checks.
    if (parcel.uspsFlatRate === true) {
      throw new Error(
        "USPS Flat Rate quoting is not enabled in V3 yet."
      )
    }

    const dimensions = [
      Number(parcel.length),
      Number(parcel.width),
      Number(parcel.height),
      Number(parcel.weight)
    ]

    if (
      !dimensions.every(
        (value) => Number.isFinite(value) && value > 0
      ) ||
      parcel.distance_unit !== "in" ||
      parcel.mass_unit !== "oz"
    ) {
      throw new Error("Invalid parcel measurements.")
    }
  }

  const sendShipment = requestShipment || (
    async (data) => {
      if (!String(token || "").trim()) {
        throw new Error("Shippo token is missing.")
      }

      const response = await axios.post(shippoUrl, data, {
        headers: {
          Authorization: `ShippoToken ${token}`,
          "Content-Type": "application/json"
        },
        timeout: 25000
      })

      return response.data
    }
  )

  const shipments = []

  for (const parcel of parcels) {
    // Only send measurements accepted by the shipment API.
    const shippoParcel = {
      length: String(parcel.length),
      width: String(parcel.width),
      height: String(parcel.height),
      distance_unit: "in",
      weight: String(parcel.weight),
      mass_unit: "oz"
    }

    const data = {
      address_from: from,
      address_to: to,
      parcels: [shippoParcel],
      async: false
    }

    if (carrierAccountIds.length > 0) {
      data.carrier_accounts = carrierAccountIds
    }

    const shipment = await sendShipment(data)

    if (!shipment || !Array.isArray(shipment.rates)) {
      throw new Error("Shippo returned an invalid rate response.")
    }

    shipments.push(shipment)
  }

  return {
    success: true,
    parcelCount: parcels.length,
    rates: combineV3ParcelRates(shipments),
    messages: shipments.flatMap(
      (shipment) =>
        Array.isArray(shipment.messages)
          ? shipment.messages
          : []
    )
  }
}