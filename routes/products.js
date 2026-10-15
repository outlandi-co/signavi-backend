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

const productUpload = (req, res, next) => {
  upload.array("images", 80)(req, res, (err) => {

    if (!err) {
      console.log("✅ PRODUCT UPLOAD SUCCESS", {
        fields: Object.keys(req.body || {}),
        files: req.files?.length || 0
      });

      return next();
    }

    console.error("❌ PRODUCT UPLOAD ERROR:", {
      code: err.code,
      field: err.field,
      message: err.message
    });

    return res.status(
      err.code === "LIMIT_FILE_SIZE" ? 413 : 400
    ).json({
      success: false,
      stage: "upload",
      code: err.code || "UPLOAD_ERROR",
      message: err.message
    });

  });
};

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
    const url = `/uploads/${file.filename}`
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
    all: files.map((file) => `/uploads/${file.filename}`),
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

/* ================= DEBUG ROUTES ================= */

router.get("/debug/counts", async (req, res) => {
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

router.get("/debug/all", async (req, res) => {
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

router.post("/", productUpload, async (req, res) => {
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
      req.body.price ?? req.body.basePrice ?? req.body.listPrice,
      0
    )

    const basePrice = toNumber(req.body.basePrice ?? price, price)
    const listPrice = toNumber(req.body.listPrice ?? price, price)

    // Nullish coalescing preserves explicit zero inventory.
    const stock = toNumber(req.body.stock ?? req.body.quantity, 0)
    const quantity = toNumber(req.body.quantity ?? stock, stock)

    const rawVariants = safeParse(req.body.variants, [])
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
              // One uploaded image for a color can be reused by its sizes.
              images: uniqueImages([
                ...uploads.forColor(color),
                ...getExistingImages(variant)
              ])
            }
          })
          .filter((variant) => variant.color && variant.size)
      : []

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

      price,
      basePrice,
      listPrice,

      stock,
      quantity,

      sizes,
      colors,
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

router.patch("/:id", productUpload, async (req, res) => {
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