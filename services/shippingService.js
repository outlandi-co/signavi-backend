import { Shippo } from "shippo"
import dotenv from "dotenv"

dotenv.config()

const shippoClient = new Shippo({
  apiKeyHeader: process.env.SHIPPO_API_KEY
})

export const createShippingLabel = async (order) => {
  try {

    const addressFrom = {
      name: "Signavi",
      street1: "123 Business St",
      city: "Merced",
      state: "CA",
      zip: "95340",
      country: "US"
    }

    const addressTo = {
      name: order.customerName,
      street1: order.address || "123 Customer St",
      city: order.city || "Merced",
      state: order.state || "CA",
      zip: order.zip || "95340",
      country: "US"
    }

    const parcel = {
      length: String(order.length || 10),
      width: String(order.width || 8),
      height: String(order.height || 2),
      distance_unit: "in",
      weight: String(order.weight || 1),
      mass_unit: "lb"
    }

    const shipment = await shippoClient.shipments.create({
      address_from: addressFrom,
      address_to: addressTo,
      parcels: [parcel],
      async: false
    })

    /* 🔥 SELECT RATE BASED ON ORDER */
    const rate = shipment.rates.find(r =>
      r.provider.toUpperCase() === (order.carrier || "USPS") &&
      r.servicelevel.name.toLowerCase().includes(
        (order.serviceLevel || "").toLowerCase()
      )
    ) || shipment.rates[0]

    if (!rate) throw new Error("No shipping rates found")

    const transaction = await shippoClient.transactions.create({
      rate: rate.object_id,
      label_file_type: "PDF",
      async: false
    })

    return {
      trackingNumber: transaction.tracking_number,
      trackingLink: transaction.tracking_url_provider,
      labelUrl: transaction.label_url,
      carrier: rate.provider,
      service: rate.servicelevel.name,
      cost: rate.amount
    }

  } catch (err) {
    console.error("❌ SHIPPING ERROR:", err.message)
    throw err
  }
}