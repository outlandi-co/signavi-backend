import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"
import Product from "../models/Product.js"

const router = express.Router()

/* ================= ENSURE UPLOADS DIR ================= */

const uploadDir = path.resolve("uploads")

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

/* ================= MULTER STORAGE ================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },

  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname || "").toLowerCase()

    cb(null, unique + ext)
  }
})

/* ================= FILE FILTER ================= */

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif"
  ]

  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error("Only image files are allowed"), false)
  }

  cb(null, true)
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
})

/* ================= HELPERS ================= */

const safeParse = (data, fallback = []) => {
  try {
    if (data === undefined || data === null || data === "") return fallback
    if (typeof data !== "string") return data

    return JSON.parse(data)
  } catch {
    return fallback
  }
}

const toNumber = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback
  if (typeof value === "boolean") return value

  if (typeof value === "string") {
    return value.toLowerCase() === "true"
  }

  return Boolean(value)
}

const generateSku = (name = "PRODUCT") => {
  const cleanName = String(name || "PRODUCT")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20)

  const random = Math.random().toString(36).slice(2, 8).toUpperCase()

  return `${cleanName || "PRODUCT"}-${Date.now()}-${random}`
}

const normalizeStorefront = (value = "") => {
  const clean = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "")

  if (clean === "signavistudio") return "signavistudio"
  if (clean === "signavi") return "signavi"
  if (clean === "both") return "both"

  return ""
}

const getStorefrontFromRequest = (req) => {
  const origin = String(req.headers.origin || "").toLowerCase()
  const referer = String(req.headers.referer || "").toLowerCase()

  const source = `${origin} ${referer}`

  // Check studio first because it includes "signavi" in the name
  if (source.includes("signavistudio.store")) {
    return "signavistudio"
  }

  if (source.includes("signavi.store")) {
    return "signavi"
  }

  const fromBody = normalizeStorefront(req.body?.storefront)
  if (fromBody) return fromBody

  const fromQuery = normalizeStorefront(req.query?.storefront)
  if (fromQuery) return fromQuery

  return "signavi"
}

const getSalesChannelFromStorefront = (storefront) => {
  if (storefront === "signavistudio") return "signavistudio_store"
  if (storefront === "signavi") return "signavi_store"

  return "admin_custom"
}

const normalizeSize = (s) => {
  if (!s) return null

  const value = String(s).trim()
  if (!value) return null

  const key = value.toUpperCase()

  const map = {
    SMALL: "Small",
    MEDIUM: "Medium",
    LARGE: "Large",
    S: "S",
    M: "M",
    L: "L",
    XL: "XL",
    XXL: "XXL",
    "2XL": "XXL",
    "2X": "XXL",
    "XX-LARGE": "XXL",
    "XX LARGE": "XXL",
    XXLARGE: "XXL",
    "3XL": "3XL",
    "3X": "3XL",
    XXXL: "3XL",
    "XXX-LARGE": "3XL",
    "XXX LARGE": "3XL",
    XXXLARGE: "3XL",
    "ONE SIZE": "One Size",
    ONESIZE: "One Size",
    "12 INCH": "12 inch",
    "12 IN": "12 inch",
    "12IN": "12 inch",
    '12"': "12 inch",
    "18 INCH": "18 inch",
    "18 IN": "18 inch",
    "18IN": "18 inch",
    '18"': "18 inch",
    "24 INCH": "24 inch",
    "24 IN": "24 inch",
    "24IN": "24 inch",
    '24"': "24 inch",
    "11 OZ": "11 oz",
    "11OZ": "11 oz",
    "15 OZ": "15 oz",
    "15OZ": "15 oz",
    "20 OZ": "20 oz",
    "20OZ": "20 oz"
  }

  return map[key] || value
}

const normalizeColorName = (color) => {
  if (!color) return ""
  return String(color).trim()
}

const normalizeColors = (colors = []) => {
  if (!Array.isArray(colors)) return []

  return colors
    .map((color) => {
      if (typeof color === "string") {
        return {
          name: normalizeColorName(color)
        }
      }

      return {
        ...color,
        name: normalizeColorName(color?.name)
      }
    })
    .filter((color) => color.name)
}

const normalizeProductType = (type) => {
  const value = String(type || "physical").trim().toLowerCase()

  if (["physical", "digital", "service"].includes(value)) {
    return value
  }

  return "physical"
}

const normalizeDigitalProduct = (data = {}) => {
  const digitalData = typeof data === "object" && data !== null ? data : {}

  const fileFormats = Array.isArray(digitalData.fileFormats)
    ? digitalData.fileFormats
    : String(digitalData.fileFormats || "")
        .split(",")
        .map((format) => format.trim())
        .filter(Boolean)

  return {
    previewImage: digitalData.previewImage || "",
    downloadFile: digitalData.downloadFile || "",
    licenseType: digitalData.licenseType || "personal-use",
    dpi: toNumber(digitalData.dpi, 300),
    printSize: digitalData.printSize || "",
    fileFormats,
    downloadLimit: toNumber(digitalData.downloadLimit, 3),
    licenseRequired: toBoolean(digitalData.licenseRequired, true)
  }
}

const normalizeDiscountType = (value = "") => {
  const discountType = String(value || "").trim().toLowerCase()

  if (["percent", "fixed"].includes(discountType)) {
    return discountType
  }

  return ""
}

const getDiscountUpdates = (body = {}) => {
  const updates = {}

  if (body.discountActive !== undefined) {
    updates.discountActive = toBoolean(body.discountActive, false)
  }

  if (body.discountType !== undefined) {
    updates.discountType = normalizeDiscountType(body.discountType)
  }

  if (body.discountValue !== undefined) {
    updates.discountValue = toNumber(body.discountValue, 0)
  }

  if (body.discountLabel !== undefined) {
    updates.discountLabel = String(body.discountLabel || "")
  }

  if (body.salePrice !== undefined) {
    updates.salePrice = toNumber(body.salePrice, 0)
  }

  if (body.originalPrice !== undefined) {
    updates.originalPrice = toNumber(body.originalPrice, 0)
  }

  return updates
}

/* ================= CREATE PRODUCT ================= */

router.post("/", upload.array("images", 20), async (req, res) => {
  try {
    const { name, description, category } = req.body

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Name required"
      })
    }

    if (!category || !String(category).trim()) {
      return res.status(400).json({
        success: false,
        message: "Category required"
      })
    }

    const storefront = getStorefrontFromRequest(req)
    const salesChannel = getSalesChannelFromStorefront(storefront)

    const productType = normalizeProductType(req.body.productType)

    const digitalProduct = normalizeDigitalProduct(
      safeParse(req.body.digitalProduct, {})
    )

    const price = toNumber(
      req.body.price || req.body.basePrice || req.body.listPrice,
      0
    )

    const basePrice = toNumber(req.body.basePrice || price, price)
    const listPrice = toNumber(req.body.listPrice || price, price)

    const stock = toNumber(req.body.stock || req.body.quantity, 0)
    const quantity = toNumber(req.body.quantity || stock, stock)

    const rawVariants = safeParse(req.body.variants, [])
    const rawSizes = safeParse(req.body.sizes, [])
    const rawColors = safeParse(req.body.colors, [])

    const sizes = Array.isArray(rawSizes)
      ? rawSizes.map(normalizeSize).filter(Boolean)
      : []

    const colors = normalizeColors(rawColors)

    const files = req.files || []
    const colorInputs = req.body.imageColors || []

    console.log("📦 PRODUCT BODY:", {
      name,
      category,
      productType,
      storefront,
      salesChannel,
      price,
      basePrice,
      listPrice,
      stock,
      quantity,
      rawSizes,
      sizes,
      colorsCount: colors.length,
      variantsCount: Array.isArray(rawVariants) ? rawVariants.length : 0
    })

    console.log("📸 FILES RECEIVED:", files.length)

    const colorMap = {}

    files.forEach((file, index) => {
      const color = Array.isArray(colorInputs)
        ? colorInputs[index]
        : colorInputs

      const normalizedColor = normalizeColorName(color)

      if (!normalizedColor) return

      if (!colorMap[normalizedColor]) {
        colorMap[normalizedColor] = []
      }

      colorMap[normalizedColor].push(`/uploads/${file.filename}`)
    })

    const digitalPreviewImage =
      colorMap.__digital_preview__?.[0] ||
      digitalProduct.previewImage ||
      ""

    const finalDigitalProduct =
      productType === "digital"
        ? {
            ...digitalProduct,
            previewImage: digitalPreviewImage
          }
        : digitalProduct

    const variants = Array.isArray(rawVariants)
      ? rawVariants
          .map((variant, index) => {
            const color = normalizeColorName(variant.color)
            const size = normalizeSize(variant.size)

            if (!size) {
              console.warn("⚠️ INVALID VARIANT SIZE:", {
                index,
                rawSize: variant.size,
                variant
              })
            }

            const variantPrice = toNumber(
              variant.price || variant.basePrice || variant.listPrice || price,
              price
            )

            const variantStock = toNumber(
              variant.stock || variant.quantity || stock,
              stock
            )

            return {
              color,
              size,
              stock: variantStock,
              quantity: toNumber(
                variant.quantity || variantStock,
                variantStock
              ),
              price: variantPrice,
              basePrice: toNumber(
                variant.basePrice || variantPrice,
                variantPrice
              ),
              listPrice: toNumber(
                variant.listPrice || variantPrice,
                variantPrice
              ),
              images: colorMap[color] || []
            }
          })
          .filter((variant) => variant.color && variant.size)
      : []

    if (productType === "physical" && !variants.length) {
      return res.status(400).json({
        success: false,
        message: "At least one valid variant is required"
      })
    }

    if (productType === "digital" && !finalDigitalProduct.previewImage) {
      return res.status(400).json({
        success: false,
        message: "Digital preview image is required"
      })
    }

    const sku = String(req.body.sku || "").trim() || generateSku(name)

    const discountUpdates = getDiscountUpdates(req.body)

    const product = await Product.create({
      sku,

      name: String(name).trim(),
      description: description || "",
      category: String(category).trim(),

      storefront,
      salesChannel,
      storefrontVisible: toBoolean(req.body.storefrontVisible, true),

      productType,
      digitalProduct: finalDigitalProduct,

      price,
      basePrice,
      listPrice,

      stock,
      quantity,

      sizes,
      colors,
      variants,

      image: productType === "digital" ? finalDigitalProduct.previewImage : "",
      images:
        productType === "digital" && finalDigitalProduct.previewImage
          ? [finalDigitalProduct.previewImage]
          : [],

      active: true,

      discountActive: discountUpdates.discountActive || false,
      discountType: discountUpdates.discountType || "",
      discountValue: discountUpdates.discountValue || 0,
      discountLabel: discountUpdates.discountLabel || "",
      salePrice: discountUpdates.salePrice || 0,
      originalPrice: discountUpdates.originalPrice || 0
    })

    console.log("✅ PRODUCT CREATED:", {
      name: product.name,
      storefront: product.storefront,
      salesChannel: product.salesChannel
    })

    return res.status(201).json({
      success: true,
      data: product
    })
  } catch (err) {
    console.error("❌ CREATE PRODUCT ERROR:", err)

    return res.status(500).json({
      success: false,
      message: "Create failed",
      error: err.message
    })
  }
})

/* ================= GET PRODUCTS ================= */

router.get("/", async (req, res) => {
  try {
    const { storefrontVisible, category, search } = req.query

    const requestedStorefront = getStorefrontFromRequest(req)

    const filter = {}
    const andFilters = []

    if (storefrontVisible === "true") {
      filter.storefrontVisible = true
    }

    if (requestedStorefront) {
      andFilters.push({
        $or: [
          { storefront: requestedStorefront },
          { storefront: "both" }
        ]
      })
    }

    if (category) {
      filter.category = category
    }

    if (search) {
      andFilters.push({
        $or: [
          {
            name: {
              $regex: search,
              $options: "i"
            }
          },
          {
            description: {
              $regex: search,
              $options: "i"
            }
          },
          {
            category: {
              $regex: search,
              $options: "i"
            }
          }
        ]
      })
    }

    if (andFilters.length > 0) {
      filter.$and = andFilters
    }

    console.log("🛒 PRODUCT FETCH FILTER:", {
      origin: req.headers.origin || "",
      requestedStorefront,
      filter
    })

    const products = await Product.find(filter).sort({ createdAt: -1 })

    return res.json({
      success: true,
      count: products.length,
      storefront: requestedStorefront,
      data: products
    })
  } catch (err) {
    console.error("❌ FETCH PRODUCTS ERROR:", err)

    return res.status(500).json({
      success: false,
      message: "Fetch failed",
      error: err.message
    })
  }
})

/* ================= GET SINGLE PRODUCT ================= */

router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      })
    }

    return res.json({
      success: true,
      data: product
    })
  } catch (err) {
    console.error("❌ FETCH PRODUCT ERROR:", err)

    return res.status(500).json({
      success: false,
      message: "Fetch product failed",
      error: err.message
    })
  }
})

/* ================= UPDATE PRODUCT ================= */

router.patch("/:id", upload.array("images", 20), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      })
    }

    const updates = {}

    const files = req.files || []
    const colorInputs = req.body.imageColors || []
    const colorMap = {}

    files.forEach((file, index) => {
      const color = Array.isArray(colorInputs)
        ? colorInputs[index]
        : colorInputs

      const normalizedColor = normalizeColorName(color)

      if (!normalizedColor) return

      if (!colorMap[normalizedColor]) {
        colorMap[normalizedColor] = []
      }

      colorMap[normalizedColor].push(`/uploads/${file.filename}`)
    })

    if (req.body.storefront !== undefined) {
  const storefront = normalizeStorefront(req.body.storefront)

  if (storefront) {
    updates.storefront = storefront
    updates.salesChannel = getSalesChannelFromStorefront(storefront)
  }
}

if (req.body.salesChannel !== undefined) {
  updates.salesChannel = String(req.body.salesChannel || "").trim()
}

if (req.body.storefrontVisible !== undefined) {
  updates.storefrontVisible = toBoolean(req.body.storefrontVisible, true)
}

    if (req.body.sku !== undefined) {
      const nextSku = String(req.body.sku || "").trim()

      if (nextSku) {
        updates.sku = nextSku
      }
    }

    if (req.body.name !== undefined) {
      updates.name = String(req.body.name).trim()
    }

    if (req.body.description !== undefined) {
      updates.description = req.body.description
    }

    if (req.body.category !== undefined) {
      updates.category = String(req.body.category).trim()
    }

    if (req.body.productType !== undefined) {
      updates.productType = normalizeProductType(req.body.productType)
    }

    if (req.body.digitalProduct !== undefined) {
      const parsedDigitalProduct = normalizeDigitalProduct(
        safeParse(req.body.digitalProduct, {})
      )

      const digitalPreviewImage =
        colorMap.__digital_preview__?.[0] ||
        parsedDigitalProduct.previewImage ||
        product.digitalProduct?.previewImage ||
        ""

      updates.digitalProduct = {
        ...parsedDigitalProduct,
        previewImage: digitalPreviewImage
      }

      updates.image = digitalPreviewImage
      updates.images = digitalPreviewImage ? [digitalPreviewImage] : []
    }

    if (
      req.body.price !== undefined ||
      req.body.basePrice !== undefined ||
      req.body.listPrice !== undefined
    ) {
      const price = toNumber(
        req.body.price || req.body.basePrice || req.body.listPrice,
        product.price || 0
      )

      updates.price = price
      updates.basePrice = toNumber(req.body.basePrice || price, price)
      updates.listPrice = toNumber(req.body.listPrice || price, price)
    }

    if (req.body.stock !== undefined || req.body.quantity !== undefined) {
      const stock = toNumber(
        req.body.stock || req.body.quantity,
        product.stock || 0
      )

      updates.stock = stock
      updates.quantity = toNumber(req.body.quantity || stock, stock)
    }

    if (req.body.sizes !== undefined) {
      const rawSizes = safeParse(req.body.sizes, [])

      updates.sizes = Array.isArray(rawSizes)
        ? rawSizes.map(normalizeSize).filter(Boolean)
        : []
    }

    if (req.body.colors !== undefined) {
      const rawColors = safeParse(req.body.colors, [])
      updates.colors = normalizeColors(rawColors)
    }

    if (req.body.variants !== undefined) {
      const rawVariants = safeParse(req.body.variants, [])

      updates.variants = Array.isArray(rawVariants)
        ? rawVariants
            .map((variant, index) => {
              const color = normalizeColorName(variant.color)
              const size = normalizeSize(variant.size)

              if (!size) {
                console.warn("⚠️ INVALID UPDATE VARIANT SIZE:", {
                  index,
                  rawSize: variant.size,
                  variant
                })
              }

              const variantPrice = toNumber(
                variant.price ||
                  variant.basePrice ||
                  variant.listPrice ||
                  product.price,
                product.price || 0
              )

              const variantStock = toNumber(
                variant.stock || variant.quantity || product.stock,
                product.stock || 0
              )

              return {
                color,
                size,
                stock: variantStock,
                quantity: toNumber(
                  variant.quantity || variantStock,
                  variantStock
                ),
                price: variantPrice,
                basePrice: toNumber(
                  variant.basePrice || variantPrice,
                  variantPrice
                ),
                listPrice: toNumber(
                  variant.listPrice || variantPrice,
                  variantPrice
                ),
                images: Array.isArray(variant.images) ? variant.images : []
              }
            })
            .filter((variant) => variant.color && variant.size)
        : []
    }

    const discountUpdates = getDiscountUpdates(req.body)

    Object.assign(updates, discountUpdates)

    console.log("🔥 PRODUCT UPDATE:", {
      id: req.params.id,
      storefront: updates.storefront,
      salesChannel: updates.salesChannel,
      updates
    })

    const updated = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    })

    return res.json({
      success: true,
      data: updated
    })
  } catch (err) {
    console.error("❌ UPDATE PRODUCT ERROR:", err)

    return res.status(500).json({
      success: false,
      message: "Update failed",
      error: err.message
    })
  }
})

/* ================= DELETE PRODUCT ================= */

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id)

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      })
    }

    return res.json({
      success: true,
      message: "Product deleted"
    })
  } catch (err) {
    console.error("❌ DELETE PRODUCT ERROR:", err)

    return res.status(500).json({
      success: false,
      message: "Delete failed",
      error: err.message
    })
  }
})

export default router