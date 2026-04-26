import express from "express"
import axios from "axios"

const router = express.Router()
const SHIPPO_API = "https://api.goshippo.com"

console.log("🚚 SHIPPING ROUTE LOADED")

/* ================= NORMALIZE ================= */
const normalizeAddress = (addr = {}) => ({
  name: addr.name || "",
  street1: addr.street1 || "",
  city: addr.city || "",
  state: (addr.state || "").toUpperCase(),
  zip: String(addr.zip || ""),
  country: (addr.country || "US").toUpperCase()
})

/* ================= GET RATES ================= */
router.post("/get-rates", async (req, res) => {
  try {
    console.log("📦 GET RATES HIT")

    if (!req.body?.address_to) {
      return res.status(400).json({ error: "address_to required" })
    }

    const addressTo = normalizeAddress(req.body.address_to)

    const shipmentRes = await axios.post(
      `${SHIPPO_API}/shipments/`,
      {
        address_from: {
          name: "SignaVi",
          street1: "123 Main St",
          city: "Merced",
          state: "CA",
          zip: "95340",
          country: "US"
        },
        address_to: addressTo,
        parcels: [
          {
            length: "10",
            width: "7",
            height: "1",
            distance_unit: "in",
            weight: "1",
            mass_unit: "lb"
          }
        ],
        async: false
      },
      {
        headers: {
          Authorization: `ShippoToken ${process.env.SHIPPO_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    )

    res.json({
      success: true,
      rates: shipmentRes.data.rates || []
    })

  } catch (err) {
    console.error("❌ RATE ERROR:", err.response?.data || err.message)

    res.status(500).json({
      error: "Failed to get rates",
      details: err.response?.data || err.message
    })
  }
})

/* ================= CREATE SHIPMENT ================= */
router.post("/create-shipment", async (req, res) => {
  try {
    if (!req.body?.address_to) {
      return res.status(400).json({ error: "address_to required" })
    }

    const addressTo = normalizeAddress(req.body.address_to)

    const shipmentRes = await axios.post(
      `${SHIPPO_API}/shipments/`,
      {
        address_from: {
          name: "SignaVi",
          street1: "123 Main St",
          city: "Merced",
          state: "CA",
          zip: "95340",
          country: "US"
        },
        address_to: addressTo,
        parcels: [
          {
            length: "10",
            width: "7",
            height: "1",
            distance_unit: "in",
            weight: "1",
            mass_unit: "lb"
          }
        ],
        async: false
      },
      {
        headers: {
          Authorization: `ShippoToken ${process.env.SHIPPO_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    )

    const rate = shipmentRes.data.rates?.[0]

    const transactionRes = await axios.post(
      `${SHIPPO_API}/transactions/`,
      {
        rate: rate.object_id,
        label_file_type: "PDF"
      },
      {
        headers: {
          Authorization: `ShippoToken ${process.env.SHIPPO_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    )

    const t = transactionRes.data

    res.json({
      trackingNumber: t.tracking_number,
      trackingLink: t.tracking_url_provider,
      labelUrl: t.label_url
    })

  } catch (err) {
    console.error("❌ SHIP ERROR:", err.response?.data || err.message)

    res.status(500).json({
      error: "Shipment failed",
      details: err.response?.data || err.message
    })
  }
})

export default router