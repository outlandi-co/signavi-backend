import express from "express"
import axios from "axios"

const router = express.Router()

/* ================= GET SHIPPING RATES ================= */
router.post("/get-rates", async (req, res) => {
  try {
    const { address_to } = req.body

    if (!address_to) {
      return res.status(400).json({ message: "Missing address_to" })
    }

    const shippoRes = await axios.post(
      "https://api.goshippo.com/shipments/",
      {
        address_from: {
          name: "SignaVi",
          street1: "123 Main St",
          city: "Merced",
          state: "CA",
          zip: "95340",
          country: "US"
        },
        address_to,
        parcels: [
          {
            length: "10",
            width: "7",
            height: "5",
            distance_unit: "in",
            weight: "2",
            mass_unit: "lb"
          }
        ],
        async: false
      },
      {
        headers: {
          Authorization: `ShippoToken ${process.env.SHIPPO_API_KEY}`
        }
      }
    )

    const rates = shippoRes.data.rates || []

    res.json({ success: true, rates })
  } catch (err) {
    console.error("❌ GET RATES ERROR:", err.response?.data || err.message)
    res.status(500).json({ message: "Failed to get rates" })
  }
})

/* ================= CREATE SHIPMENT ================= */
router.post("/create-shipment", async (req, res) => {
  try {
    const { address_to, rate_id } = req.body

    if (!address_to || !rate_id) {
      return res.status(400).json({ message: "Missing data" })
    }

    const transaction = await axios.post(
      "https://api.goshippo.com/transactions/",
      {
        rate: rate_id,
        label_file_type: "PDF",
        async: false
      },
      {
        headers: {
          Authorization: `ShippoToken ${process.env.SHIPPO_API_KEY}`
        }
      }
    )

    res.json({
      success: true,
      trackingNumber: transaction.data.tracking_number,
      trackingLink: transaction.data.tracking_url_provider,
      labelUrl: transaction.data.label_url
    })
  } catch (err) {
    console.error("❌ SHIPMENT ERROR:", err.response?.data || err.message)
    res.status(500).json({ message: "Shipment failed" })
  }
})

export default router