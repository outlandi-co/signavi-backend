import mongoose from "mongoose"

/* ================= COLOR SCHEMA ================= */

const colorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: "",
      trim: true
    }
  },
  { _id: false }
)

/* ================= VARIANT SCHEMA ================= */

const variantSchema = new mongoose.Schema(
  {
    color: {
      type: String,
      default: "",
      trim: true
    },

    size: {
      type: String,
      default: "",
      trim: true
    },

    stock: {
      type: Number,
      default: 0,
      min: 0
    },

    quantity: {
      type: Number,
      default: 0,
      min: 0
    },

    price: {
      type: Number,
      default: 0,
      min: 0
    },

    basePrice: {
      type: Number,
      default: 0,
      min: 0
    },

    listPrice: {
      type: Number,
      default: 0,
      min: 0
    },

    images: {
      type: [String],
      default: []
    }
  },
  { _id: false }
)

/* ================= DIGITAL PRODUCT ================= */

const digitalProductSchema = new mongoose.Schema(
  {
    previewImage: {
      type: String,
      default: ""
    },

    downloadFile: {
      type: String,
      default: ""
    },

    licenseType: {
      type: String,
      default: "personal-use"
    },

    dpi: {
      type: Number,
      default: 300
    },

    printSize: {
      type: String,
      default: ""
    },

    fileFormats: {
      type: [String],
      default: []
    },

    downloadLimit: {
      type: Number,
      default: 3
    },

    licenseRequired: {
      type: Boolean,
      default: true
    }
  },
  { _id: false }
)

/* ================= PRODUCT SCHEMA ================= */

const productSchema = new mongoose.Schema(
  {
    vendor: {
      type: String,
      default: "",
      trim: true
    },

    vendors: {
      type: [String],
      default: []
    },

    name: {
      type: String,
      required: true,
      trim: true,
      index: true
    },

    sku: {
      type: String,
      trim: true,
      sparse: true,
      index: true
    },

    description: {
      type: String,
      default: "",
      trim: true
    },

    category: {
      type: String,
      default: "",
      trim: true,
      index: true
    },

    productType: {
      type: String,
      enum: ["physical", "digital", "service"],
      default: "physical",
      index: true
    },

    digitalProduct: {
      type: digitalProductSchema,
      default: () => ({})
    },

    cost: {
      type: Number,
      default: 0,
      min: 0
    },

    basePrice: {
      type: Number,
      default: 0,
      min: 0
    },

    price: {
      type: Number,
      default: 0,
      min: 0
    },

    listPrice: {
      type: Number,
      default: 0,
      min: 0
    },

    originalPrice: {
      type: Number,
      default: 0,
      min: 0
    },

    salePrice: {
      type: Number,
      default: 0,
      min: 0
    },

    discountActive: {
      type: Boolean,
      default: false,
      index: true
    },

    discountType: {
      type: String,
      enum: ["", "percent", "fixed"],
      default: ""
    },

    discountValue: {
      type: Number,
      default: 0,
      min: 0
    },

    discountLabel: {
      type: String,
      default: "",
      trim: true
    },

    discountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },

    profitMargin: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },

    onSale: {
      type: Boolean,
      default: false,
      index: true
    },

    stock: {
      type: Number,
      default: 0,
      min: 0
    },

    quantity: {
      type: Number,
      default: 0,
      min: 0
    },

    image: {
      type: String,
      default: ""
    },

    imageUrl: {
      type: String,
      default: ""
    },

    images: {
      type: [String],
      default: []
    },

    colors: {
      type: [colorSchema],
      default: []
    },

    sizes: {
      type: [String],
      default: []
    },

    variants: {
      type: [variantSchema],
      default: []
    },

    storefrontVisible: {
      type: Boolean,
      default: true,
      index: true
    },

    storefront: {
      type: String,
      enum: ["signavi", "signavistudio"],
      default: "signavi",
      index: true
    },

    salesChannel: {
      type: String,
      enum: ["signavi_store", "signavi_studio"],
      required: true,
      default: "signavi_store",
      index: true
    },

    active: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  { timestamps: true }
)

/* ================= CLEAN EMPTY SKU + SYNC STOREFRONT ================= */

productSchema.pre("validate", function cleanAndSyncProduct() {
  if (this.sku !== undefined && this.sku !== null) {
    const clean = String(this.sku).trim()

    if (!clean) {
      this.sku = undefined
    } else {
      this.sku = clean
    }
  }

  if (this.salesChannel === "signavi_studio") {
    this.storefront = "signavistudio"
  }

  if (this.salesChannel === "signavi_store") {
    this.storefront = "signavi"
  }
})

const Product =
  mongoose.models.Product ||
  mongoose.model("Product", productSchema)

export default Product