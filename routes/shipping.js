import express from "express"
import axios from "axios"

const router = express.Router()
const SHIPPO_API = "https://api.goshippo.com"

console.log("🚚 SHIPPING ROUTE LOADED")

/* ================= NORMALIZE ADDRESS ================= */
const normalizeAddress = (addr = {}) => {
  return {
    name: addr.name || "",
    street1: addr.street1 || "",
    city: addr.city || "",
    state: (addr.state || "").toUpperCase().slice(0, 2),
    zip: String(addr.zip || "").trim(),
    country: (addr.country || "US").toUpperCase()
  }
}

/* ================= HEALTH CHECK ================= */
router.get("/health", (req, res) => {
  res.json({ ok: true, route: "shipping" })
})

/* ================= GET RATES ================= */
router.post("/get-rates", async (req, res) => {
  try {
    console.log("\n📦 ===== GET RATES HIT =====")

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

    const rates = shipmentRes.data.rates || []

    console.log("💰 Rates Found:", rates.length)

    res.json({
      success: true,
      rates: rates.slice(0, 3)
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
    console.log("\n🚚 ===== CREATE SHIPMENT HIT =====")

    const { address_to, rate_id } = req.body

    if (!address_to) {
      return res.status(400).json({ error: "address_to required" })
    }

    const addressTo = normalizeAddress(address_to)

    console.log("📍 Address:", addressTo)
    console.log("🎯 Selected Rate ID:", rate_id)

    /* =========================================================
       🔥 USE SELECTED RATE IF PROVIDED
    ========================================================= */
    if (rate_id) {
      console.log("✅ Using user-selected rate")

      const transactionRes = await axios.post(
        `${SHIPPO_API}/transactions/`,
        {
          rate: rate_id,
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

      return res.json({
        success: true,
        trackingNumber: t.tracking_number,
        trackingLink: t.tracking_url_provider,
        labelUrl: t.label_url
      })
    }

    /* =========================================================
       🔄 FALLBACK (if no rate_id)
    ========================================================= */
    console.log("⚠️ No rate_id provided — falling back to first rate")

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

    const shipment = shipmentRes.data
    const rate = shipment.rates?.[0]

    if (!rate) {
      return res.status(400).json({
        error: "No rates found"
      })
    }

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
      success: true,
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