import { normalizeShippingPackageCatalog } from "../utils/normalizeShippingPackageCatalog.mjs"
import { resolveCheckoutStorefront } from "../utils/resolveCheckoutStorefront.js"
import { selectPreferredShippingPackage } from "../utils/selectPreferredShippingPackage.mjs"
import ShippingPackage from "../models/ShippingPackage.js"
import { isDimensionRateEligible } from "../utils/isDimensionRateEligible.mjs"
import ShippingProductPackageProfile from "../models/ShippingProductPackageProfile.js"
import { buildVerifiedSavedPackageParcels } from "../utils/buildVerifiedSavedPackageParcels.mjs"
import { loadActiveShippingPackages } from "../utils/loadActiveShippingPackages.mjs"
import OrderV3StorefrontShipping from "../models/Order.js"
import { createV3StorefrontShippingQuoteRouter } from "./v3StorefrontShippingQuote.js"
import { createV3StorefrontTrustedShipments } from "../utils/createV3StorefrontTrustedShipments.js"

import express from "express"
import axios from "axios"
import Product from "../models/Product.js"
import {
  createShippingQuote,
  createMultiParcelShippingQuote
} from "../utils/shippingQuote.js"
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
  const carrierAccounts = String(
    process.env.SHIPPO_CARRIER_ACCOUNT_IDS || ""
  )
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)

  const shipmentData = {
    address_from: from,
    address_to: to,
    parcels,
    async: false
  }

  if (carrierAccounts.length > 0) {
    shipmentData.carrier_accounts = carrierAccounts
  }

  // Development-only diagnostic.
  // Never log addresses, customer data, or API credentials.
  if (process.env.NODE_ENV !== "production") {
    console.log("SHIPPO PARCEL REQUEST:", {
      parcelCount: parcels.length,
      parcels: parcels.map((parcel) => ({
        length: parcel.length,
        width: parcel.width,
        height: parcel.height,
        weight: parcel.weight,
        distance_unit: parcel.distance_unit,
        mass_unit: parcel.mass_unit
      })),
      testMode: token.startsWith("shippo_test_")
    })
  }

  const response = await axios.post(
    "https://api.goshippo.com/shipments/",
    shipmentData,
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

/* ================= MULTI-PARCEL RATE AGGREGATION ================= */

const validUsdRate = (rate) =>
  Boolean(rate?.object_id) &&
  String(rate.currency || "").toUpperCase() === "USD" &&
  Number.isFinite(Number(rate.amount)) &&
  Number(rate.amount) > 0 &&
  Number.isSafeInteger(Math.round(Number(rate.amount) * 100))

const multiParcelServiceKey = (rate) => {
  const provider = String(rate?.provider || "").trim()
  const account = String(rate?.carrier_account || "").trim()
  const token = String(rate?.servicelevel?.token || "").trim()
  return provider && account && token
    ? JSON.stringify([provider, account, token])
    : null
}

// Every returned option must cover EVERY parcel. Never quote a partial order.
const combineParcelRates = (shipments) => {
  const first = new Map()
  for (const rate of shipments[0]?.rates || []) {
    if (!validUsdRate(rate)) continue
    const key = multiParcelServiceKey(rate)
    if (!key) continue
    const prior = first.get(key)
    if (!prior || Number(rate.amount) < Number(prior.amount)) {
      first.set(key, rate)
    }
  }

  const common = [...first.entries()].map(([key, rate]) => ({
    key,
    rates: [rate]
  }))

  for (const shipment of shipments.slice(1)) {
    const choices = new Map()
    for (const rate of shipment.rates || []) {
      if (!validUsdRate(rate)) continue
      const key = multiParcelServiceKey(rate)
      if (!key) continue
      const prior = choices.get(key)
      if (!prior || Number(rate.amount) < Number(prior.amount)) {
        choices.set(key, rate)
      }
    }
    for (let index = common.length - 1; index >= 0; index--) {
      const next = choices.get(common[index].key)
      if (!next) common.splice(index, 1)
      else common[index].rates.push(next)
    }
  }

  return common.map(({ rates }) => {
    const totalCents = rates.reduce(
      (sum, rate) => sum + Math.round(Number(rate.amount) * 100), 0
    )
    return {
      ...rates[0],
      // UI compatibility: the first real Shippo ID is only a display ID;
      // the signed quote stores the full set of underlying rate IDs.
      amount: (totalCents / 100).toFixed(2),
      parcelRateIds: rates.map((rate) => rate.object_id),
      parcelRates: rates
    }
  }).sort((a, b) => Number(a.amount) - Number(b.amount))
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
    // STUDIO_058H27_DIMENSION_RATE_GUARD
    // Carrier-template packaging must never receive an
    // ordinary dimension-based rate.
    if (!isDimensionRateEligible(box)) {
      return false
    }

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

  return selectPreferredShippingPackage({
    candidates,
    packages,
    productShipping,
    quantity
  })
}


/* ================= BUILD CART PARCELS ================= */

export const makeCartParcels = async (items, packages, storefront = "signavi_store") => {
  if (
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > 50
  ) {
    return {
      error: "Provide 1 to 50 cart items."
    }
  }

  if (!["signavi_store", "signavi_studio"].includes(storefront)) {
    return {
      error: "Invalid shipping storefront."
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
          "Each cart item needs a valid productId and integer quantity (1ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“200)."
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
    },
    storefront
  })
    .select(
      "_id productType shipping active storefrontVisible storefront"
    )
    .lean()

  if (products.length !== quantityById.size) {
    return {
      error:
        "One or more products are unavailable. Refresh your cart."
    }
  }

  const parcels = []

  // STUDIO_058H40_TRUSTED_PARCEL_ENTRIES
  // Internal only; never pass this array directly to Shippo.
  const parcelEntries = []

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


    // SIGNAVI_SHIPPING_059_STUDIO_SANDBOX_ONLY
    // Only modifies the product object returned by the read-only
    // database query. Nothing is saved to MongoDB.
    const studioSandboxMeasurements =
      process.env.NODE_ENV === "development" &&
      process.env.SHIPPO_CUSTOMER_RATE_MODE === "test" &&
      process.env.SIGNAVI_DEV_SHIPPING_PACKAGES === "true" &&
      storefront === "signavi_studio" &&
      String(product._id) === "6ad12bb31032fce6ba5995a8"

    if (studioSandboxMeasurements) {
      const shipping = product.shipping || {}

      const missingMeasurements = [
        shipping.weightOz,
        shipping.lengthIn,
        shipping.widthIn,
        shipping.heightIn
      ].some(value => !Number.isFinite(Number(value)) ||
                       Number(value) <= 0)

      if (missingMeasurements) {
        product.shipping = {
          ...shipping,
          mode: "product_measurements",
          weightOz: 6,
          lengthIn: 12,
          widthIn: 10,
          heightIn: 0.75,
          packagingType: "mailer",
          shipSeparately: true
        }

        console.log(
          "DEV SHIPPING: sandbox measurements applied to Black T Shirt"
        )
      }
    }

    const quantity = quantityById.get(
      String(product._id)
    )

    // STUDIO_058H21_VERIFIED_SAVED_PACKAGE
    // Saved packaging uses fulfillment-verified product/package
    // information, not measurements copied from the editor.
    if (product.shipping?.mode === "saved_package") {
      const selectedPackageId = String(
        product.shipping.packageId ?? ""
      )

      if (!/^[a-f0-9]{24}$/i.test(selectedPackageId)) {
        return {
          error: "Select a valid saved shipping package."
        }
      }

      const selectedPackage = packages.find(
        (box) =>
          String(box.id).toLowerCase() ===
          selectedPackageId.toLowerCase()
      )

      if (!selectedPackage) {
        return {
          error: "Selected shipping package is unavailable."
        }
      }

      if (
        selectedPackage.type !== product.shipping.packagingType
      ) {
        return {
          error: "Saved shipping package type no longer matches the product."
        }
      }

      // Shippo's carrier-specific parcel template and eligible
      // rate filtering must be integrated before quoting USPS
      // Flat Rate. Never substitute ordinary box rates.
      if (selectedPackage.uspsFlatRate === true) {
        return {
          error:
            "USPS Flat Rate checkout requires verified carrier-template integration. Contact the store."
        }
      }

      if (!isDimensionRateEligible(selectedPackage)) {
        return {
          error:
            "Carrier-specific saved packaging requires verified rate integration. Contact the store."
        }
      }

      // Retrieve trusted profile data. Never accept it from
      // the customer's request body.
      const profiles = await ShippingProductPackageProfile.find({
        productId: product._id,
        packageId: selectedPackageId,
        active: true
      })
        .select(
          "productId packageId unitWeightOz verifiedCapacity verifiedBy verifiedAt verificationNotes active"
        )
        .lean()

      const verified = buildVerifiedSavedPackageParcels({
        productId: String(product._id),
        selectedPackageId,
        quantity,
        packages,
        profiles,
        shipSeparately: product.shipping.shipSeparately === true
      })

      if (verified.error) {
        return { error: verified.error }
      }

      if (
        !Array.isArray(verified.parcels) ||
        verified.parcels.length < 1 ||
        parcels.length + verified.parcels.length > 10
      ) {
        return {
          error:
            "This order requires more than 10 packages or has incomplete shipping information."
        }
      }

      for (const parcel of verified.parcels) {
        parcels.push(parcel)
        parcelEntries.push({
          parcel,
          packaging: selectedPackage
        })
      }

      continue
    }

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

      const parcel = {
        length: String(box.length),
        width: String(box.width),
        height: String(box.height),
        distance_unit: "in",
        weight: String(weight),
        mass_unit: "oz"
      }

      parcels.push(parcel)
      parcelEntries.push({
        parcel,
        packaging: box
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

  if (
    parcelEntries.length !== parcels.length ||
    parcelEntries.some((entry, index) =>
      entry.parcel !== parcels[index] ||
      !entry.packaging ||
      !/^[a-f0-9]{24}$/i.test(
        String(entry.packaging.id ?? "")
      )
    )
  ) {
    return {
      error: "Trusted shipping package identity is unavailable."
    }
  }

  return { parcels, parcelEntries }
}

/* ================= CUSTOMER SHIPPING RATES ================= */

router.post("/get-rates", async (req, res) => {
  try {
    let checkoutStorefront

    try {
      checkoutStorefront = resolveCheckoutStorefront(req.body)
    } catch (channelError) {
      return res.status(400).json({
        success: false,
        message: channelError.message
      })
    }

    const to = getDestination(
      req.body?.address_to
    )

    if (!to) {
      return res.status(400).json({
        message: "Enter a complete shipping address."
      })
    }

    let packages = await loadActiveShippingPackages(ShippingPackage)

    const developmentPackageFallback =
      process.env.NODE_ENV === "development" &&
      process.env.SHIPPO_CUSTOMER_RATE_MODE === "test" &&
      process.env.SIGNAVI_DEV_SHIPPING_PACKAGES === "true"

    if (
      developmentPackageFallback &&
      (!Array.isArray(packages) || packages.length === 0)
    ) {
      packages = normalizeShippingPackageCatalog([
        {
          _id: "000000000000000000000001",
          id: "000000000000000000000001",
          name: "Development Poly Mailer",
          carrier: "Generic",
          type: "mailer",
          lengthIn: 14,
          widthIn: 10,
          heightIn: 2,
          tareWeightOz: 1,
          maxWeightOz: 64,
          clearanceIn: 0,
          uspsFlatRate: false,
          shippoParcelTemplate: "",
          verifiedShirtCapacity: null,
          active: true
        },
        {
          _id: "000000000000000000000002",
          id: "000000000000000000000002",
          name: "Development Shipping Box",
          carrier: "Generic",
          type: "box",
          lengthIn: 12,
          widthIn: 10,
          heightIn: 4,
          tareWeightOz: 8,
          maxWeightOz: 320,
          clearanceIn: 0,
          uspsFlatRate: false,
          shippoParcelTemplate: "",
          verifiedShirtCapacity: null,
          active: true
        }
      ])

      console.log("DEV SHIPPING: provisional packages enabled")
    }
    const from = getShipFrom()

    // Use a Shippo test key for local customer rate requests.
    // Preserve existing live-key behavior in other shipping endpoints.
    const useTestRates =
      process.env.NODE_ENV !== "production" &&
      process.env.SHIPPO_CUSTOMER_RATE_MODE === "test"

    const token = useTestRates
      ? String(process.env.SHIPPO_TEST_API_KEY || "").trim()
      : getShippoKey()

    if (useTestRates && !token.startsWith("shippo_test_")) {
      return res.status(503).json({
        success: false,
        message: "Shippo test-rate credentials are not configured."
      })
    }

    if (!Array.isArray(packages) || packages.length === 0 || !from || !token) {
      return res.status(503).json({
        message:
          "Cart shipping is not configured. Please contact the store."
      })
    }

    // Only product IDs and quantities are accepted from the cart.
    // The backend retrieves dimensions from MongoDB.

    const result = await makeCartParcels(
      req.body?.items,
      packages,
      checkoutStorefront
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

    const testMode = token.startsWith("shippo_test_")

    if (result.parcels.length === 1) {
      const shipment = await requestShippoRates({
        from, to, parcels: result.parcels, token
      })
      console.log("CART SHIPPO RATE DIAGNOSTIC:", {
        rawRateCount: Array.isArray(shipment.rates)
          ? shipment.rates.length
          : 0,
        acceptedRateCount: Array.isArray(shipment.rates)
          ? shipment.rates.filter(validUsdRate).length
          : 0,
        messageCount: Array.isArray(shipment.messages)
          ? shipment.messages.length
          : 0,
        messageCategories: Array.isArray(shipment.messages)
          ? shipment.messages.map((message) => {
              const source = String(message?.source || "").toLowerCase();
              const code = String(message?.code || "").toLowerCase();

              if (source.includes("carrier")) return "carrier";
              if (source.includes("shippo")) return "shippo";
              if (source.includes("address")) return "address";
              if (source.includes("parcel")) return "parcel";
              if (code.includes("address")) return "address";
              if (code.includes("parcel")) return "parcel";
              if (code.includes("carrier")) return "carrier";

              return "unspecified";
            }).slice(0, 10)
          : [],
        messageCodes: Array.isArray(shipment.messages)
  ? shipment.messages.slice(0, 10).map((message) => ({
      code: String(message?.code || "").slice(0, 80),
      source: String(message?.source || "").slice(0, 80)
    }))
  : [],
        parcelCount: result.parcels.length,
        testMode
      })

      return res.json({
        success: true,
        rates: (shipment.rates || [])
          .filter(validUsdRate)
          .map((rate) => ({
            ...rate,
            shippingQuote: createShippingQuote({
              items: req.body.items,
              destination: to,
              rate,
              testMode
            })
          })),
        testMode,
        parcelCount: 1,
        messages: shipment.messages || []
      })
    }

    // Quote every parcel individually. Sequential requests avoid bursts
    // against carrier sandbox accounts and never accept missing parcels.
    const shipments = []
    for (const parcel of result.parcels) {
      shipments.push(await requestShippoRates({
        from, to, parcels: [parcel], token
      }))
    }

    const rates = combineParcelRates(shipments).map((rate) => {
      const { parcelRates, ...displayRate } = rate
      return {
        ...displayRate,
        shippingQuote: createMultiParcelShippingQuote({
          items: req.body.items,
          destination: to,
          rates: parcelRates,
          testMode
        })
      }
    })

    return res.json({
      success: true,
      rates,
      testMode,
      parcelCount: result.parcels.length,
      messages: shipments.flatMap((shipment) => shipment.messages || [])
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
   ADMIN SHIPPING CALCULATOR ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â TEST MODE ONLY

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

      if (!token.startsWith("shippo_live_")) {
        return res.status(503).json({
          message:
            "Calculator requires a Shippo LIVE key."
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
        testMode: false,
        rates,
        parcelCount: parcels.length,
        messages: shipment.messages || []
      })
    } catch (err) {
      console.error(
        "Shippo admin live quote failed:",
        err.response?.status || err.message
      )

      return res.status(502).json({
        message:
          "Shippo could not quote these packages. Check live carrier availability and the addresses."
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

// Constructed only when explicitly requested by server registration.
// This factory does not activate any HTTP endpoint.
export const createConfiguredV3StorefrontShippingQuoteRouter = () => {
  const getCustomerToken = () => {
    const useTestRates =
      process.env.NODE_ENV !== "production" &&
      process.env.SHIPPO_CUSTOMER_RATE_MODE === "test"

    const token = useTestRates
      ? String(process.env.SHIPPO_TEST_API_KEY || "").trim()
      : getShippoKey()

    if (useTestRates && !token.startsWith("shippo_test_")) {
      return ""
    }

    return token
  }

  const getTrustedShipments = createV3StorefrontTrustedShipments({
    buildParcels: makeCartParcels,
    requestRates: requestShippoRates,
    getPackages: () =>
      loadActiveShippingPackages(ShippingPackage),
    getShipFrom,
    getDestination,
    getToken: getCustomerToken
  })

  return createV3StorefrontShippingQuoteRouter({
    findOrder: id => OrderV3StorefrontShipping.findById(id),
    getTrustedShipments
  })
}
export default router
