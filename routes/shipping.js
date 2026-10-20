
import express from "express"
import axios from "axios"
import Product from "../models/Product.js"
import { createShippingQuote } from "../utils/shippingQuote.js"
import { requireAuth } from "../middleware/auth.js"

const router = express.Router()

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      message: "Administrator access required"
    })
  }

  next()
}

/* ================= VALIDATION HELPERS ================= */

const validPositive = (value, max) =>
  value !== null &&
  value !== undefined &&
  String(value).trim() !== "" &&
  Number.isFinite(Number(value)) &&
  Number(value) > 0 &&
  Number(value) <= max

const getShipFrom = () => {
  const from = {
    name: process.env.SHIP_FROM_NAME,
    street1: process.env.SHIP_FROM_STREET1,
    city: process.env.SHIP_FROM_CITY,
    state: process.env.SHIP_FROM_STATE,
    zip: process.env.SHIP_FROM_ZIP,
    country: process.env.SHIP_FROM_COUNTRY || "US"
  }

  return Object.values(from).every(
    (value) => String(value || "").trim()
  )
    ? from
    : null
}

const getDestination = (input) => {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    return null
  }

  const address = {
    name: String(
      input.name || "Recipient"
    ).trim().slice(0, 100),

    street1: String(
      input.street1 || ""
    ).trim().slice(0, 200),

    city: String(
      input.city || ""
    ).trim().slice(0, 100),

    state: String(
      input.state || ""
    ).trim().slice(0, 50),

    zip: String(
      input.zip || ""
    ).trim().slice(0, 24),

    country: String(
      input.country || "US"
    ).trim().toUpperCase()
  }

  return (
    address.street1 &&
    address.city &&
    address.state &&
    address.zip &&
    /^[A-Z]{2}$/.test(address.country)
  )
    ? address
    : null
}

const getShippoKey = () =>
  String(process.env.SHIPPO_API_KEY || "").trim()

/* ================= SHIPPO REQUEST ================= */

const requestShippoRates = async ({
  from,
  to,
  parcels,
  token
}) => {
  const response = await axios.post(
    "https://api.goshippo.com/shipments/",
    {
      address_from: from,
      address_to: to,
      parcels,
      async: false
    },
    {
      headers: {
        Authorization: `ShippoToken ${token}`,
        "Content-Type": "application/json"
      },
      timeout: 25000
    }
  )

  return response.data
}

/* =========================================================
   SHIPPING PACKAGING CONFIGURATION

   Configure SHIPPING_PACKAGES_JSON in the backend environment.

   This code requires real, measured package dimensions
   and packaging weights. It will not invent package sizes.

   Each configuration entry uses:
   - name
   - type
   - lengthIn
   - widthIn
   - heightIn
   - tareWeightOz
   - maxWeightOz
   - clearanceIn (optional)

   Products use packagingType:
   mailer, box, fragile, oversized, or custom.

   The packing algorithm uses one product type per parcel,
   with axis-aligned grid packing for multiple units.
   Different products are not mixed into one parcel.

   Orders that cannot be packaged safely are rejected.
   ========================================================= */

const allowedPackaging = new Set([
  "mailer",
  "box",
  "fragile",
  "oversized",
  "custom"
])

const getPackages = () => {
  const configured = process.env.SHIPPING_PACKAGES_JSON

  if (!configured) {
    return null
  }

  let parsed

  try {
    parsed = JSON.parse(configured)
  } catch {
    return null
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length < 1 ||
    parsed.length > 40
  ) {
    return null
  }

  const result = parsed.map((box) => {
    if (
      !box ||
      typeof box !== "object" ||
      Array.isArray(box)
    ) {
      return null
    }

    const type = String(box.type || "").toLowerCase()

    const length = Number(box.lengthIn)
    const width = Number(box.widthIn)
    const height = Number(box.heightIn)

    const tare = Number(box.tareWeightOz)
    const maxWeight = Number(box.maxWeightOz)

    const clearance =
      box.clearanceIn === undefined
        ? 0.5
        : Number(box.clearanceIn)

    if (
      !allowedPackaging.has(type) ||
      !String(box.name || "").trim() ||
      !validPositive(length, 120) ||
      !validPositive(width, 120) ||
      !validPositive(height, 120) ||
      !Number.isFinite(tare) ||
      tare < 0 ||
      !validPositive(maxWeight, 2400) ||
      tare >= maxWeight ||
      !Number.isFinite(clearance) ||
      clearance < 0 ||
      clearance >= Math.min(length, width, height)
    ) {
      return null
    }

    return {
      name: String(box.name).trim(),
      type,
      length,
      width,
      height,
      tare,
      maxWeight,
      clearance
    }
  })

  return result.every(Boolean)
    ? result
    : null
}

/* ================= PACKAGE FIT HELPERS ================= */

const orientations = ([a, b, c]) => [
  [a, b, c],
  [a, c, b],
  [b, a, c],
  [b, c, a],
  [c, a, b],
  [c, b, a]
]


const choosePackage = (
  productShipping,
  quantity,
  packages
) => {
  const dims = [
    Number(productShipping.lengthIn),
    Number(productShipping.widthIn),
    Number(productShipping.heightIn)
  ]

  const unitWeight = Number(productShipping.weightOz)
  const shipSeparately =
    productShipping.shipSeparately === true

  if (
    !dims.every((value) => validPositive(value, 120)) ||
    !validPositive(unitWeight, 2400) ||
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    return null
  }

  const candidates = []


  // Protect specialized packaging categories.
  // Regular products can use boxes, mailers, or custom packaging.
  // Fragile and oversized products require their designated packaging.

  const preferredType = String(
    productShipping.packagingType || ""
  ).toLowerCase()

  const specializedTypes = new Set([
    "fragile",
    "oversized"
  ])

  const compatiblePackages = packages.filter((box) => {
    if (specializedTypes.has(preferredType)) {
      return box.type === preferredType
    }

    return !specializedTypes.has(box.type)
  })

  for (const box of compatiblePackages) {

    const usable = [
      box.length - box.clearance,
      box.width - box.clearance,
      box.height - box.clearance
    ]

    let maxBySpace = 0

    for (const [l, w, h] of orientations(dims)) {
      const capacity =
        Math.floor(usable[0] / l) *
        Math.floor(usable[1] / w) *
        Math.floor(usable[2] / h)

      maxBySpace = Math.max(maxBySpace, capacity)
    }

    const maxByWeight = Math.floor(
      (box.maxWeight - box.tare) / unitWeight
    )

    const perParcel = Math.min(
      shipSeparately ? 1 : 200,
      maxBySpace,
      maxByWeight
    )

    if (perParcel < 1) continue

    candidates.push({
      box,
      perParcel,
      parcelCount: Math.ceil(quantity / perParcel),
      volume: box.length * box.width * box.height
    })
  }

  candidates.sort(
    (a, b) =>
      a.parcelCount - b.parcelCount ||
      a.volume - b.volume
  )

  return candidates[0] || null
}


/* ================= BUILD CART PARCELS ================= */

const makeCartParcels = async (items, packages) => {
  if (
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > 50
  ) {
    return {
      error: "Provide 1 to 50 cart items."
    }
  }

  const quantityById = new Map()
  let totalQuantity = 0

  for (const item of items) {
    const productId = item?.productId
    const quantity = item?.quantity

    if (
      typeof productId !== "string" ||
      !/^[a-f0-9]{24}$/i.test(productId) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 200
    ) {
      return {
        error:
          "Each cart item needs a valid productId and integer quantity (1–200)."
      }
    }

    totalQuantity += quantity

    if (totalQuantity > 200) {
      return {
        error:
          "Contact us for a shipping quote on orders over 200 units."
      }
    }

    const id = productId.toLowerCase()

    quantityById.set(
      id,
      (quantityById.get(id) || 0) + quantity
    )
  }

  // Look up trusted measurements in MongoDB.
  // Do not trust weights or dimensions submitted by the browser.

  const products = await Product.find({
    _id: {
      $in: [...quantityById.keys()]
    }
  })
    .select(
      "_id productType shipping active storefrontVisible"
    )
    .lean()

  if (products.length !== quantityById.size) {
    return {
      error:
        "One or more products are unavailable. Refresh your cart."
    }
  }

  const parcels = []

  for (const product of products) {
    if (
      product.active === false ||
      product.storefrontVisible === false
    ) {
      return {
        error:
          "One or more products are unavailable. Refresh your cart."
      }
    }

    // Digital products and services do not need carrier shipping.
    if (
      product.productType === "digital" ||
      product.productType === "service"
    ) {
      continue
    }

    const quantity = quantityById.get(
      String(product._id)
    )

    const selection = choosePackage(
      product.shipping || {},
      quantity,
      packages
    )

    if (!selection) {
      return {
        error:
          "Shipping measurements or suitable packaging are missing for a product. Contact the store."
      }
    }

    let remaining = quantity

    while (remaining > 0) {
      const units = Math.min(
        remaining,
        selection.perParcel
      )

      const { box } = selection

      // Include package weight and round upward to an ounce.
      const weight = Math.ceil(
        box.tare +
        units * Number(product.shipping.weightOz)
      )

      if (weight > 2400) {
        return {
          error: "A shipping package is too heavy."
        }
      }

      parcels.push({
        length: String(box.length),
        width: String(box.width),
        height: String(box.height),
        distance_unit: "in",
        weight: String(weight),
        mass_unit: "oz"
      })

      if (parcels.length > 10) {
        return {
          error:
            "This order requires more than 10 packages. Contact us for a shipping quote."
        }
      }

      remaining -= units
    }
  }

  return { parcels }
}

/* ================= CUSTOMER SHIPPING RATES ================= */

router.post("/get-rates", async (req, res) => {
  try {
    const to = getDestination(
      req.body?.address_to
    )

    if (!to) {
      return res.status(400).json({
        message: "Enter a complete shipping address."
      })
    }

    const packages = getPackages()
    const from = getShipFrom()
    const token = getShippoKey()

    if (!packages || !from || !token) {
      return res.status(503).json({
        message:
          "Cart shipping is not configured. Please contact the store."
      })
    }

    // Only product IDs and quantities are accepted from the cart.
    // The backend retrieves dimensions from MongoDB.

    const result = await makeCartParcels(
      req.body?.items,
      packages
    )

    if (result.error) {
      return res.status(422).json({
        success: false,
        message: result.error
      })
    }

    if (result.parcels.length === 0) {
      return res.json({
        success: true,
        rates: [],
        noShippingRequired: true
      })
    }

    const shipment = await requestShippoRates({
      from,
      to,
      parcels: result.parcels,
      token
    })

    return res.json({
      success: true,

      // Preserve the existing frontend rate format.
      rates: (shipment.rates || [])
        .filter((rate) =>
          Boolean(rate?.object_id) &&
          String(rate?.currency || "").toUpperCase() === "USD" &&
          Number.isFinite(Number(rate?.amount)) &&
          Number(rate.amount) > 0
        )
        .map((rate) => ({
          ...rate,
          shippingQuote: createShippingQuote({
            items: req.body.items,
            destination: to,
            rate,
            testMode: token.startsWith("shippo_test_")
          })
        })),

      testMode: token.startsWith("shippo_test_"),
      parcelCount: result.parcels.length,
      messages: shipment.messages || []
    })
  } catch (err) {
    console.error(
      "GET CART RATES ERROR:",
      err.response?.status || err.message
    )

    return res.status(502).json({
      message:
        "Shipping rates are unavailable. Please try again later."
    })
  }
})

/* =========================================================
   ADMIN SHIPPING CALCULATOR — TEST MODE ONLY

   Allows administrator to quote manually packed parcels.
   Does not automatically package cart items.
   Does not alter Square orders.
   ========================================================= */

router.post(
  "/admin/compare",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const token = getShippoKey()

      if (!token.startsWith("shippo_test_")) {
        return res.status(503).json({
          message:
            "Calculator requires a Shippo TEST key. No live rates requested."
        })
      }

      const from = getShipFrom()

      if (!from) {
        return res.status(503).json({
          message:
            "Configure SHIP_FROM_NAME, STREET1, CITY, STATE, ZIP and COUNTRY on the backend."
        })
      }

      const to = getDestination(
        req.body?.address_to
      )

      if (!to) {
        return res.status(400).json({
          message:
            "Enter a complete destination address."
        })
      }

      const incoming = req.body?.parcels

      if (
        !Array.isArray(incoming) ||
        incoming.length < 1 ||
        incoming.length > 10
      ) {
        return res.status(400).json({
          message:
            "Enter 1 to 10 fully packed parcels."
        })
      }

      const parcels = []

      for (const item of incoming) {
        if (
          ![
            item?.length,
            item?.width,
            item?.height
          ].every((v) => validPositive(v, 120)) ||
          !validPositive(item?.weight, 150) ||
          !["lb", "oz"].includes(item?.mass_unit)
        ) {
          return res.status(400).json({
            message:
              "Each parcel needs valid dimensions (inches), weight and lb/oz units."
          })
        }

        parcels.push({
          length: String(Number(item.length)),
          width: String(Number(item.width)),
          height: String(Number(item.height)),
          distance_unit: "in",
          weight: String(Number(item.weight)),
          mass_unit: item.mass_unit
        })
      }

      const shipment = await requestShippoRates({
        from,
        to,
        parcels,
        token
      })

      const rates = (
        shipment.rates || []
      )
        .map((rate) => ({
          id: rate.object_id,
          provider: rate.provider,
          service:
            rate.servicelevel?.name ||
            rate.servicelevel_name ||
            "Shipping",
          amount: Number(rate.amount),
          currency: rate.currency,
          estimatedDays:
            rate.estimated_days ?? null
        }))
        .filter(
          (rate) =>
            Number.isFinite(rate.amount) &&
            rate.amount > 0 &&
            rate.currency === "USD"
        )
        .sort((a, b) => a.amount - b.amount)

      return res.json({
        success: true,
        testMode: true,
        rates,
        parcelCount: parcels.length,
        messages: shipment.messages || []
      })
    } catch (err) {
      console.error(
        "Shippo admin test quote failed:",
        err.response?.status || err.message
      )

      return res.status(502).json({
        message:
          "Shippo could not quote these packages. Check test carrier availability and the addresses."
      })
    }
  }
)

/* ================= CREATE TEST SHIPMENT ================= */

router.post(
  "/create-shipment",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    // Never purchase live postage through this endpoint yet.
    if (!getShippoKey().startsWith("shippo_test_")) {
      return res.status(503).json({
        message:
          "Live label purchasing is not enabled yet."
      })
    }

    try {
      const {
        address_to,
        rate_id
      } = req.body || {}

      if (!address_to || !rate_id) {
        return res.status(400).json({
          message: "Missing data"
        })
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
            Authorization:
              `ShippoToken ${getShippoKey()}`
          },
          timeout: 25000
        }
      )

      if (
        transaction.data?.status !== "SUCCESS" ||
        !transaction.data?.label_url
      ) {
        return res.status(502).json({
          message:
            "Shippo did not create a successful test label."
        })
      }

      return res.json({
        success: true,
        testMode: true,
        trackingNumber:
          transaction.data.tracking_number,
        trackingLink:
          transaction.data.tracking_url_provider,
        labelUrl:
          transaction.data.label_url
      })
    } catch (err) {
      console.error(
        "SHIPMENT ERROR:",
        err.response?.status || err.message
      )

      return res.status(500).json({
        message: "Shipment failed"
      })
    }
  }
)

export default router
