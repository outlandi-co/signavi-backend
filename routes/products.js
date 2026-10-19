
import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"
import Product from "../models/Product.js"
import Material from "../models/Material.js"
import { requireAuth } from "../middleware/auth.js"

const router = express.Router()

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Administrator access required"
    })
  }

  next()
}

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

/* ================= PERMANENT CLOUDINARY IMAGE STORAGE ================= */

// Uses the Cloudinary Upload API directly with Node.js 18+ built-ins.
// No additional npm package is required. The API secret stays on the server.
const uploadToCloudinary = async (file) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary image storage is not configured on the backend")
  }

  if (typeof fetch !== "function" || typeof Blob !== "function" ||
      typeof FormData !== "function") {
    throw new Error("Node.js 18 or later is required for Cloudinary uploads")
  }

  const body = new FormData()
  const imageBytes = await fs.promises.readFile(file.path)
  body.append(
    "file",
    new Blob([imageBytes], { type: file.mimetype }),
    path.basename(file.originalname || file.filename)
  )
  body.append("folder", "signavi/products")

  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
      {
        method: "POST",
        headers: { Authorization: `Basic ${credentials}` },
        body,
        signal: controller.signal
      }
    )

    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.secure_url?.startsWith("https://")) {
      throw new Error(
        `Cloudinary upload failed (${response.status}): ${result.error?.message || "No secure URL returned"}`
      )
    }

    return result.secure_url
  } finally {
    clearTimeout(timeout)
  }
}

const productUpload = (req, res, next) => {
  upload.array("images", 80)(req, res, async (err) => {
    if (err) {
      console.error("❌ PRODUCT UPLOAD ERROR:", {
        code: err.code,
        field: err.field,
        message: err.message
      })

      return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
        success: false,
        stage: "upload",
        code: err.code || "UPLOAD_ERROR",
        message: err.message
      })
    }

    const files = req.files || []

    try {
      // Upload before changing MongoDB, so a failed image upload never
      // creates or updates a product with a broken local /uploads/ URL.
      for (const file of files) {
        file.secure_url = await uploadToCloudinary(file)
      }

      console.log("✅ PRODUCT UPLOAD SUCCESS", {
        fields: Object.keys(req.body || {}),
        cloudinaryImages: files.length
      })

      return next()
    } catch (uploadError) {
      console.error("❌ CLOUDINARY PRODUCT IMAGE ERROR:", uploadError.message)
      return res.status(502).json({
        success: false,
        stage: "cloudinary",
        message: "Product images could not be stored. The product was not changed.",
        error: uploadError.message
      })
    } finally {
      // Multer uses a short-lived disk buffer only. The originals now live
      // on Cloudinary, so remove all temporary files (also on failures).
      await Promise.allSettled(
        files.filter((file) => file.path).map((file) => fs.promises.unlink(file.path))
      )
    }
  })
}

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

  if (clean === "signavi_store") return "signavi_store"
  if (clean === "signavi_studio") return "signavi_studio"

  return ""
}

const getStorefrontFromRequest = (req) => {
  const origin = String(req.headers.origin || "").toLowerCase()
  const referer = String(req.headers.referer || "").toLowerCase()
  const host = String(req.headers.host || "").toLowerCase()

  const source = `${origin} ${referer} ${host}`

  console.log("🏪 STOREFRONT DETECT:", {
    origin,
    referer,
    host,
    bodyStorefront: req.body?.storefront,
    queryStorefront: req.query?.storefront
  })

  const fromBody = normalizeStorefront(req.body?.storefront)
  if (fromBody) return fromBody

  const fromQuery = normalizeStorefront(req.query?.storefront)
  if (fromQuery) return fromQuery

  if (source.includes("signavistudio.store")) {
    return "signavi_studio"
  }

  if (source.includes("signavi.store")) {
    return "signavi_store"
  }

  return "signavi_store"
}

const getSalesChannelFromStorefront = (storefront) => {
  if (storefront === "signavi_studio") return "signavi_studio"
  if (storefront === "signavi_store") return "signavi_store"

  return "signavi_store"
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

// Keep every uploaded image, including images that have no color selected.
// Multer produces an array when the same multipart field is repeated, but
// some admin forms send a JSON-encoded array or the imageColors[] field.
const parseImageColors = (body = {}) => {
  const input = body.imageColors ?? body["imageColors[]"] ?? []
  const parsed = safeParse(input, input)

  if (Array.isArray(parsed)) return parsed.map(normalizeColorName)
  if (typeof parsed === "string" && parsed.trim()) {
    return [normalizeColorName(parsed)]
  }
  return []
}

const uniqueImages = (images = []) =>
  [...new Set(images.filter((image) => typeof image === "string" && image.trim()))]

const getExistingImages = (item = {}) =>
  Array.isArray(item.images) ? uniqueImages(item.images) : []

const variantKey = (color, size) =>
  `${normalizeColorName(color).toLowerCase()}::${normalizeSize(size) || ""}`

const collectProductUploads = (files = [], body = {}, variantList = []) => {
  const inputs = parseImageColors(body)
  const byColor = new Map()
  const unassigned = []
  const distinctColors = [
    ...new Set(
      variantList
        .map((variant) => normalizeColorName(variant.color).toLowerCase())
        .filter(Boolean)
    )
  ]

  files.forEach((file, index) => {
    const url = file.secure_url
    let color = normalizeColorName(
      inputs[index] ?? (inputs.length === 1 ? inputs[0] : "")
    ).toLowerCase()

    // If the form omits imageColors, a one-color product is unambiguous.
    // Never silently assign an unlabeled image to an arbitrary color on
    // a multi-color product.
    if (!color && distinctColors.length === 1) color = distinctColors[0]

    if (color) {
      byColor.set(color, uniqueImages([...(byColor.get(color) || []), url]))
    } else {
      unassigned.push(url)
    }
  })

  if (files.length > 0) {
    console.log("PRODUCT IMAGE ASSIGNMENTS:", {
      uploadedFiles: files.length,
      colorLabels: inputs,
      matchedColors: [...byColor.keys()],
      unassignedFiles: unassigned.length
    })
  }

  return {
    byColor,
    unassigned,
    all: files.map((file) => file.secure_url),
    forColor: (color) => byColor.get(normalizeColorName(color).toLowerCase()) || []
  }
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

// Product and variant material links use MongoDB Material _id values.
// Business-facing Material.id and colorSku remain separate identifiers.
class MaterialUsageInputError extends Error {
  constructor(message) {
    super(message)
    this.name = "MaterialUsageInputError"
    this.statusCode = 400
  }
}

const parseMaterialUsage = (raw, label = "materialUsage") => {
  let entries = raw

  if (typeof entries === "string") {
    try {
      entries = JSON.parse(entries)
    } catch {
      throw new MaterialUsageInputError(`${label} must be a valid JSON array.`)
    }
  }

  if (!Array.isArray(entries)) {
    throw new MaterialUsageInputError(`${label} must be an array.`)
  }

  const seen = new Set()

  return entries.map((entry, index) => {
    const itemLabel = `${label}[${index}]`

    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new MaterialUsageInputError(`${itemLabel} must be an object.`)
    }

    const material = String(entry.material ?? "").trim()
    if (!/^[a-f0-9]{24}$/i.test(material)) {
      throw new MaterialUsageInputError(`${itemLabel}.material must be a Material MongoDB _id.`)
    }

    if (
      entry.colorSku !== undefined &&
      entry.colorSku !== null &&
      typeof entry.colorSku !== "string"
    ) {
      throw new MaterialUsageInputError(`${itemLabel}.colorSku must be a string.`)
    }

    const colorSku = (entry.colorSku || "").trim()
    const rawQuantity = entry.quantityPerUnit

    if (
      (typeof rawQuantity !== "string" && typeof rawQuantity !== "number") ||
      (typeof rawQuantity === "string" && !rawQuantity.trim())
    ) {
      throw new MaterialUsageInputError(`${itemLabel}.quantityPerUnit must be a positive number.`)
    }

    const quantityPerUnit = Number(rawQuantity)
    if (!Number.isFinite(quantityPerUnit) || quantityPerUnit < 0.000001) {
      throw new MaterialUsageInputError(`${itemLabel}.quantityPerUnit must be at least 0.000001.`)
    }

    const key = `${material.toLowerCase()}::${colorSku.toLowerCase()}`
    if (seen.has(key)) {
      throw new MaterialUsageInputError(`${label} has a duplicate material/colorSku pair.`)
    }
    seen.add(key)

    return { material, colorSku, quantityPerUnit }
  })
}

const validateMaterialReferences = async (usageLists) => {
  const links = usageLists.flat()
  if (links.length === 0) return

  const materialIds = [...new Set(links.map((link) => link.material.toLowerCase()))]
  const materials = await Material.find({ _id: { $in: materialIds } })
    .select("_id colors")
    .lean()
  const byId = new Map(materials.map((material) => [String(material._id).toLowerCase(), material]))

  for (const link of links) {
    const material = byId.get(link.material.toLowerCase())
    if (!material) {
      throw new MaterialUsageInputError(`Material ${link.material} was not found.`)
    }

    // A specific color SKU must actually belong to the selected material.
    if (link.colorSku) {
      const found = Array.isArray(material.colors) && material.colors.some(
        (color) => String(color?.sku ?? "").trim().toLowerCase() === link.colorSku.toLowerCase()
      )

      if (!found) {
        throw new MaterialUsageInputError(
          `Color SKU ${link.colorSku} does not belong to material ${link.material}.`
        )
      }
    }
  }
}

/* ================= PRODUCT SHIPPING HELPERS ================= */

const parseProductShipping = (raw) => {
  if (raw === undefined) {
    return { provided: false }
  }

  let data

  try {
    data = typeof raw === "string"
      ? JSON.parse(raw)
      : raw
  } catch {
    return { error: "Invalid shipping JSON." }
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { error: "Shipping must be an object." }
  }

  const shipping = {}

  for (const field of [
    "weightOz",
    "lengthIn",
    "widthIn",
    "heightIn"
  ]) {
    const value = data[field]

    if (
      value === undefined ||
      value === null ||
      typeof value === "boolean" ||
      typeof value === "object" ||
      String(value).trim() === ""
    ) {
      return { error: `${field} must be a positive number.` }
    }

    const number = Number(value)

    if (!Number.isFinite(number) || number <= 0) {
      return { error: `${field} must be a positive number.` }
    }

    shipping[field] = number
  }

  const allowedPackaging = [
    "mailer",
    "box",
    "fragile",
    "oversized",
    "custom"
  ]

  if (!allowedPackaging.includes(data.packagingType)) {
    return { error: "Invalid shipping packaging type." }
  }

  if (
    data.shipSeparately !== undefined &&
    ![true, false, "true", "false"].includes(data.shipSeparately)
  ) {
    return { error: "Invalid separate-shipping setting." }
  }

  shipping.packagingType = data.packagingType
  shipping.shipSeparately =
    data.shipSeparately === true ||
    data.shipSeparately === "true"

  return {
    provided: true,
    value: shipping
  }
}

/* ================= DEBUG ROUTES ================= */

router.get("/debug/counts", requireAuth, requireAdmin, async (req, res) => {
  try {
    const all = await Product.countDocuments()

    const studio = await Product.countDocuments({
      storefront: "signavi_studio"
    })

    const store = await Product.countDocuments({
      storefront: "signavi_store"
    })

    const latest = await Product.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select("name storefront salesChannel storefrontVisible active createdAt")

    return res.json({
      success: true,
      collection: Product.collection.name,
      all,
      studio,
      store,
      latest
    })
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    })
  }
})

router.get("/debug/all", requireAuth, requireAdmin, async (req, res) => {
  try {
    const products = await Product.find({})
      .select("name storefront salesChannel storefrontVisible active createdAt")
      .sort({ createdAt: -1 })

    return res.json({
      success: true,
      collection: Product.collection.name,
      count: products.length,
      data: products
    })
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    })
  }
})

/* ================= CREATE PRODUCT ================= */

router.post("/", requireAuth, requireAdmin, productUpload, async (req, res) => {
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

    const shippingResult = parseProductShipping(req.body.shipping)

    if (shippingResult.error) {
      return res.status(400).json({
        success: false,
        message: shippingResult.error
      })
    }

    if (shippingResult.provided && productType !== "physical") {
      return res.status(400).json({
        success: false,
        message: "Shipping measurements are only for physical products."
      })
    }

    const digitalProduct = normalizeDigitalProduct(
      safeParse(req.body.digitalProduct, {})
    )

    const price = toNumber(
      req.body.price ?? req.body.basePrice ?? req.body.listPrice,
      0
    )

    const basePrice = toNumber(req.body.basePrice ?? price, price)
    const listPrice = toNumber(req.body.listPrice ?? price, price)

    // Nullish coalescing preserves explicit zero inventory.
    const stock = toNumber(req.body.stock ?? req.body.quantity, 0)
    const quantity = toNumber(req.body.quantity ?? stock, stock)

    const rawVariants = safeParse(req.body.variants, [])
    const materialUsage = parseMaterialUsage(
      req.body.materialUsage === undefined ? [] : req.body.materialUsage
    )
    const rawSizes = safeParse(req.body.sizes, [])
    const rawColors = safeParse(req.body.colors, [])

    const sizes = Array.isArray(rawSizes)
      ? rawSizes.map(normalizeSize).filter(Boolean)
      : []

    const colors = normalizeColors(rawColors)

    const files = req.files || []

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

    const uploads = collectProductUploads(files, req.body, rawVariants)

    const digitalPreviewImage =
      uploads.forColor("__digital_preview__")[0] ||
      uploads.unassigned[0] ||
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
          .map((variant) => {
            const color = normalizeColorName(variant.color)
            const size = normalizeSize(variant.size)

            const variantPrice = toNumber(
              variant.price ?? variant.basePrice ?? variant.listPrice ?? price,
              price
            )

            const variantStock = toNumber(
              variant.stock ?? variant.quantity ?? stock,
              stock
            )

            return {
              color,
              size,
              stock: variantStock,
              quantity: toNumber(
                variant.quantity ?? variantStock,
                variantStock
              ),
              price: variantPrice,
              basePrice: toNumber(
                variant.basePrice ?? variantPrice,
                variantPrice
              ),
              listPrice: toNumber(
                variant.listPrice ?? variantPrice,
                variantPrice
              ),
              materialUsage: parseMaterialUsage(
                variant.materialUsage === undefined ? [] : variant.materialUsage,
                `Variant ${color} / ${size} materialUsage`
              ),
              // One uploaded image for a color can be reused by its sizes.
              images: uniqueImages([
                ...uploads.forColor(color),
                ...getExistingImages(variant)
              ])
            }
          })
          .filter((variant) => variant.color && variant.size)
      : []

    await validateMaterialReferences([
      materialUsage,
      ...variants.map((variant) => variant.materialUsage)
    ])

    if (productType === "digital" && !finalDigitalProduct.previewImage) {
      return res.status(400).json({
        success: false,
        message: "Digital preview image is required"
      })
    }

    const sku = String(req.body.sku || "").trim() || generateSku(name)

    // Save a top-level gallery for physical products too. This covers
    // items with no color/size variants and provides a general fallback.
    const physicalImages = uniqueImages([
      ...uploads.all.filter((url) => !uploads.forColor("__digital_preview__").includes(url)),
      ...variants.flatMap((variant) => variant.images)
    ])

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
      ...(shippingResult.provided ? { shipping: shippingResult.value } : {}),

      price,
      basePrice,
      listPrice,

      stock,
      quantity,

      sizes,
      colors,
      materialUsage,
      variants,

      image:
        productType === "digital"
          ? finalDigitalProduct.previewImage
          : physicalImages[0] || "",
      images:
        productType === "digital"
          ? (finalDigitalProduct.previewImage ? [finalDigitalProduct.previewImage] : [])
          : physicalImages,

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

    return res.status(err.statusCode === 400 ? 400 : 500).json({
      success: false,
      message: err.statusCode === 400 ? err.message : "Create failed",
      ...(err.statusCode === 400 ? {} : { error: err.message })
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
        storefront: requestedStorefront
      })
    }

    if (category) {
      filter.category = category
    }

    if (search) {
      andFilters.push({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { category: { $regex: search, $options: "i" } }
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

    console.log("🔍 FINAL PRODUCT FILTER")
    console.log(JSON.stringify(filter, null, 2))

    const matchingProducts = await Product.find({
      storefront: requestedStorefront
    }).select("name storefront salesChannel storefrontVisible active")

    console.log(
      "📦 MATCHING PRODUCTS:",
      matchingProducts.map((product) => ({
        name: product.name,
        storefront: product.storefront,
        salesChannel: product.salesChannel,
        storefrontVisible: product.storefrontVisible,
        active: product.active
      }))
    )

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

router.patch("/:id", requireAuth, requireAdmin, productUpload, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      })
    }

    const updates = {}

    // Omitted field means preserve the product's existing material links.
    // Sending [] intentionally clears them.
    if (req.body.materialUsage !== undefined) {
      updates.materialUsage = parseMaterialUsage(req.body.materialUsage)
    }

    const files = req.files || []
    const receivedVariants =
      req.body.variants !== undefined
        ? safeParse(req.body.variants, null)
        : (product.variants || []).map((variant) =>
            typeof variant.toObject === "function" ? variant.toObject() : variant
          )

    if (!Array.isArray(receivedVariants)) {
      return res.status(400).json({
        success: false,
        message: "Invalid variants data"
      })
    }

    const uploads = collectProductUploads(files, req.body, receivedVariants)

    if (req.body.storefront !== undefined) {
      const storefront = normalizeStorefront(req.body.storefront)

      if (storefront) {
        updates.storefront = storefront
        updates.salesChannel = getSalesChannelFromStorefront(storefront)
      }
    }

    if (req.body.salesChannel !== undefined) {
      const salesChannel = normalizeStorefront(req.body.salesChannel)

      if (salesChannel) {
        updates.salesChannel = salesChannel
        updates.storefront = salesChannel
      }
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

    if (req.body.shipping !== undefined) {
      const shippingResult = parseProductShipping(req.body.shipping)

      if (shippingResult.error) {
        return res.status(400).json({
          success: false,
          message: shippingResult.error
        })
      }

      const resultingType = updates.productType || product.productType || "physical"

      if (resultingType !== "physical") {
        return res.status(400).json({
          success: false,
          message: "Shipping measurements are only for physical products."
        })
      }

      updates.shipping = shippingResult.value
    }

    if (
      req.body.digitalProduct !== undefined ||
      uploads.forColor("__digital_preview__").length > 0
    ) {
      const parsedDigitalProduct = normalizeDigitalProduct(
        safeParse(req.body.digitalProduct, product.digitalProduct || {})
      )

      const digitalPreviewImage =
        uploads.forColor("__digital_preview__")[0] ||
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
        req.body.price ?? req.body.basePrice ?? req.body.listPrice,
        product.price ?? 0
      )

      updates.price = price
      updates.basePrice = toNumber(req.body.basePrice ?? price, price)
      updates.listPrice = toNumber(req.body.listPrice ?? price, price)
    }

    if (req.body.stock !== undefined || req.body.quantity !== undefined) {
      const stock = toNumber(
        req.body.stock ?? req.body.quantity,
        product.stock ?? 0
      )

      updates.stock = stock
      updates.quantity = toNumber(req.body.quantity ?? stock, stock)
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

    // Process image-only edits too; they do not need to resend "variants".
    if (req.body.variants !== undefined || files.length > 0) {
      const originalByKey = new Map(
        (product.variants || []).map((variant) => [
          variantKey(variant.color, variant.size),
          variant
        ])
      )

      updates.variants = receivedVariants
        .map((variant) => {
          const color = normalizeColorName(variant.color)
          const size = normalizeSize(variant.size)
          const previous = originalByKey.get(variantKey(color, size)) || {}

          const variantPrice = toNumber(
            variant.price ?? variant.basePrice ?? variant.listPrice ??
              previous.price ?? product.price,
            product.price ?? 0
          )

          // Never replace zero stock with a parent-product value.
          const variantStock = toNumber(
            variant.stock ?? variant.quantity ?? previous.stock ?? product.stock,
            product.stock ?? 0
          )

          const baseImages = Array.isArray(variant.images)
            ? variant.images
            : getExistingImages(previous)

          return {
            color,
            size,
            stock: variantStock,
            quantity: toNumber(
              variant.quantity ?? variantStock,
              variantStock
            ),
            price: variantPrice,
            basePrice: toNumber(
              variant.basePrice ?? variantPrice,
              variantPrice
            ),
            listPrice: toNumber(
              variant.listPrice ?? variantPrice,
              variantPrice
            ),
            // A variant edit may omit materialUsage: preserve the links
            // already saved for that exact color and size.
            materialUsage: parseMaterialUsage(
              variant.materialUsage === undefined
                ? (previous.materialUsage || [])
                : variant.materialUsage,
              `Variant ${color} / ${size} materialUsage`
            ),
            // New images first, then the saved gallery. Each size under
            // a color receives the matching uploaded color images.
            images: uniqueImages([
              ...uploads.forColor(color),
              ...baseImages
            ])
          }
        })
        .filter((variant) => variant.color && variant.size)
    }

    // Keep a general product gallery synchronized with new uploads.
    // The selected variant gallery remains the source for each color/size.
    if (files.length > 0 || req.body.variants !== undefined) {
      const currentImages = getExistingImages(product)
      const latestVariantImages = (updates.variants || product.variants || [])
        .flatMap((variant) => getExistingImages(variant))
      const savedImages = uniqueImages([
        ...uploads.all.filter((url) => !uploads.forColor("__digital_preview__").includes(url)),
        ...latestVariantImages,
        ...currentImages
      ])

      const resolvedType = updates.productType || product.productType || "physical"
      if (resolvedType !== "digital") {
        updates.images = savedImages
        updates.image = savedImages[0] || product.image || ""
      }
    }

    // Validate every material reference that would be written by this edit.
    // Unrelated field edits do not revalidate untouched material arrays.
    if (updates.materialUsage !== undefined || updates.variants !== undefined) {
      await validateMaterialReferences([
        updates.materialUsage || [],
        ...(updates.variants || []).map((variant) => variant.materialUsage)
      ])
    }

    const discountUpdates = getDiscountUpdates(req.body)

    Object.assign(updates, discountUpdates)

    console.log("🔥 PRODUCT UPDATE:", {
      id: req.params.id,
      previousStorefront: product.storefront,
      newStorefront: updates.storefront || product.storefront,
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

    return res.status(err.statusCode === 400 ? 400 : 500).json({
      success: false,
      message: err.statusCode === 400 ? err.message : "Update failed",
      ...(err.statusCode === 400 ? {} : { error: err.message })
    })
  }
})

/* ================= DELETE PRODUCT ================= */

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
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
