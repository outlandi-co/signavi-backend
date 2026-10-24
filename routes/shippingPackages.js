import express from "express"
import { requireAuth } from "../middleware/auth.js"
import ShippingPackage from "../models/ShippingPackage.js"

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