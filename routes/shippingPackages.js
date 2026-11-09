import express from "express"
import { readFile } from "node:fs/promises"
import { requireAuth } from "../middleware/auth.js"
import ShippingPackage from "../models/ShippingPackage.js"
import {
  validateShippingPackageAdminChange
} from "../utils/validateShippingPackageAdminChange.mjs"

const router = express.Router()

router.use(requireAuth)

router.use((req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Administrator access required"
    })
  }
  next()
})

const fields = [
  "name",
  "carrier",
  "type",
  "lengthIn",
  "widthIn",
  "heightIn",
  "tareWeightOz",
  "maxWeightOz",
  "clearanceIn",
  "uspsFlatRate",
  "shippoParcelTemplate",
  "verifiedShirtCapacity",
  "active"
]

const pickFields = (input) =>
  Object.fromEntries(
    fields
      .filter((key) =>
        Object.prototype.hasOwnProperty.call(input || {}, key)
      )
      .map((key) => [key, input[key]])
  )

// STUDIO_058H44S_REFERENCE_CATALOG
// Administrator reference only. Never creates active shipping packages.
router.get("/reference-catalog", async (req, res) => {
  try {
    const filename = new URL(
      "../data/carrierFlatRateReferenceCatalog.json",
      import.meta.url
    )

    const catalog = JSON.parse(
      await readFile(filename, "utf8")
    )

    if (
      catalog.schemaVersion !== 1 ||
      catalog.activatedForCheckout !== false ||
      !Array.isArray(catalog.packages) ||
      catalog.packages.length !== 20 ||
      new Set(catalog.packages.map(item => item.id)).size !== 20 ||
      !catalog.packages.every(item =>
        item.active === false &&
        item.checkoutEligible === false &&
        item.physicallyVerified === false &&
        item.shippingWeightOz === null &&
        item.shippoParcelTemplate === null
      )
    ) {
      return res.status(500).json({
        success: false,
        message: "Carrier reference catalog is invalid"
      })
    }

    res.set("Cache-Control", "no-store")

    return res.json({
      success: true,
      referenceOnly: true,
      data: catalog
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not load carrier reference catalog"
    })
  }
})

router.get("/", async (req, res) => {
  try {
    const packages = await ShippingPackage
      .find()
      .sort({ name: 1 })

    return res.json({
      success: true,
      data: packages
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not load shipping packages"
    })
  }
})

router.post("/", async (req, res) => {
  try {
    const data = pickFields(req.body)

    // STUDIO_058H44M_ADMIN_PACKAGE_VALIDATION
    if (!validateShippingPackageAdminChange({ changes: data })) {
      return res.status(400).json({
        success: false,
        message: "Invalid package configuration"
      })
    }

    const shippingPackage = await ShippingPackage.create(data)

    return res.status(201).json({
      success: true,
      data: shippingPackage
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid package configuration"
    })
  }
})

router.patch("/:id", async (req, res) => {
  try {
    const data = pickFields(req.body)

    // Validate the complete package before updating it.
    const existing = await ShippingPackage.findById(
      req.params.id
    )

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Package not found"
      })
    }

    if (!validateShippingPackageAdminChange({
      existing: existing.toObject(),
      changes: data
    })) {
      return res.status(400).json({
        success: false,
        message: "Invalid package configuration"
      })
    }

    const shippingPackage =
      await ShippingPackage.findByIdAndUpdate(
        req.params.id,
        { $set: data },
        {
          returnDocument: "after",
          runValidators: true
        }
      )

    if (!shippingPackage) {
      return res.status(404).json({
        success: false,
        message: "Package not found"
      })
    }

    return res.json({
      success: true,
      data: shippingPackage
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Could not update package"
    })
  }
})

export default router