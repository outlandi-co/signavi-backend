import express from "express"
import axios from "axios"

const router = express.Router()

const SHIPPO_API = "https://api.goshippo.com"

/* 🔥 CONFIRM ROUTE LOAD */
console.log("🚚 SHIPPING ROUTE LOADED")

/* ================= CREATE SHIPMENT ================= */
router.post("/create-shipment", async (req, res) => {
  try {
    console.log("\n📦 ===== NEW SHIPMENT REQUEST =====")

    /* 🔥 LOG BODY */
    console.log("📥 Incoming Body:", JSON.stringify(req.body, null, 2))

    /* 🔥 VALIDATION */
    if (!req.body || !req.body.address_to) {
      console.error("❌ address_to missing")

      return res.status(400).json({
        error: "address_to is required",
        example: {
          address_to: {
            name: "Adam",
            street1: "456 Test St",
            city: "Merced",
            state: "CA",
            zip: "95340",
            country: "US"
          }
        }
      })
    }

    const addressTo = req.body.address_to

    console.log("📍 Shipping To:", addressTo)

    /* ================= CREATE SHIPMENT ================= */
    console.log("🚚 Calling Shippo /shipments...")

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

    console.log("📦 Shipment created")
    console.log("➡️ Rates:", shipment.rates?.length || 0)

    const rate = shipment.rates?.[0]

    if (!rate) {
      console.error("❌ No rates returned from Shippo")

      return res.status(400).json({
        error: "No shipping rates found",
        shipment
      })
    }

    console.log("💰 Selected Rate:")
    console.log("➡️ Carrier:", rate.provider)
    console.log("➡️ Service:", rate.servicelevel?.name)
    console.log("➡️ Cost:", rate.amount)

    /* ================= CREATE LABEL ================= */
    console.log("🏷️ Creating label...")

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

    const transaction = transactionRes.data

    console.log("🏷️ Label created successfully")
    console.log("➡️ Tracking:", transaction.tracking_number)
    console.log("➡️ Label URL:", transaction.label_url)

    console.log("✅ ===== SHIPMENT COMPLETE =====\n")

    res.json({
      success: true,
      trackingNumber: transaction.tracking_number,
      trackingLink: transaction.tracking_url_provider,
      labelUrl: transaction.label_url
    })

  } catch (err) {
    console.error("\n❌ ===== SHIP ERROR =====")

    if (err.response) {
      console.error("📡 Shippo Response:", err.response.data)
    } else {
      console.error("🔥 Server Error:", err.message)
    }

    console.error("❌ =====================\n")

    res.status(500).json({
      error: "Shipment failed",
      details: err.response?.data || err.message
    })
  }
})

export default router