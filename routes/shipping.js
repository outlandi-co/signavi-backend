import express from "express"
import fetch from "node-fetch"

const router = express.Router()

router.post("/rates", async (req, res) => {
  try {
    const { items, address } = req.body || {}

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: "Invalid items" })
    }

    const totalWeight = items.reduce(
      (sum, item) =>
        sum + (Number(item.weight) || 1) * (Number(item.quantity) || 1),
      0
    )

    const shipment = {
      address_from: {
        name: "Signavi",
        street1: "123 Main St",
        city: "Merced",
        state: "CA",
        zip: "95340",
        country: "US"
      },
      address_to: address || {
        name: "Customer",
        street1: "510 Townsend St",
        city: "San Francisco",
        state: "CA",
        zip: "94103",
        country: "US"
      },
      parcels: [{
        length: "10",
        width: "8",
        height: "4",
        distance_unit: "in",
        weight: totalWeight || 1,
        mass_unit: "lb"
      }],
      async: false
    }

    const response = await fetch("https://api.goshippo.com/shipments/", {
      method: "POST",
      headers: {
        Authorization: `ShippoToken ${process.env.SHIPPO_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(shipment)
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("❌ Shippo API error:", data)
      return res.status(500).json({ error: "Shippo failed" })
    }

    const rates = data.rates.map(rate => ({
      id: rate.object_id,
      provider: rate.provider,
      service: rate.servicelevel?.name,
      amount: Number(rate.amount),
      currency: rate.currency,
      estimatedDays: rate.estimated_days
    }))

    res.json(rates)

  } catch (err) {
    console.error("❌ Shipping error:", err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router