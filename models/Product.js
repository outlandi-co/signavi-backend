import mongoose from "mongoose"
import PRODUCT_TYPES from "./schema/product/productType.enum.js"
import digitalProductSchema from "./schema/product/digitalProduct.schema.js"

/* ================= NORMALIZE SIZE / OPTION ================= */

const normalizeSize = (s) => {
  if (!s) return null

  const value = String(s).trim()

  if (!value) return null

  const key = value.toUpperCase()

  const map = {
    XS: "XS",

    SMALL: "S",
    S: "S",

    MEDIUM: "M",
    M: "M",

    LARGE: "L",
    L: "L",

    XL: "XL",
    "EXTRA-LARGE": "XL",
    "X-LARGE": "XL",
    "EXTRA LARGE": "XL",

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

    "4XL": "4XL",
    "4X": "4XL",

    "ONE SIZE": "One Size",
    ONESIZE: "One Size",

    "12 INCH": "12 inch",
    "12 IN": "12 inch",
    "12IN": "12 inch",
    "12\"": "12 inch",

    "18 INCH": "18 inch",
    "18 IN": "18 inch",
    "18IN": "18 inch",
    "18\"": "18 inch",

    "24 INCH": "24 inch",
    "24 IN": "24 inch",
    "24IN": "24 inch",
    "24\"": "24 inch",

    "11 OZ": "11 oz",
    "11OZ": "11 oz",

    "15 OZ": "15 oz",
    "15OZ": "15 oz",

    "20 OZ": "20 oz",
    "20OZ": "20 oz"
  }

  return map[key] || value
}

/* ================= COLOR ================= */

const colorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    code: {
      type: String,
      default: ""
    },

    hex: {
      type: String,
      default: ""
    }
  },
  {
    _id: false
  }
)

/* ================= VARIANT ================= */

const variantSchema = new mongoose.Schema(
  {
    color: {
      type: String,
      required: true,
      trim: true
    },

    size: {
      type: String,
      required: true,
      set: normalizeSize
    },

    stock: {
      type: Number,
      default: 0
    },

    quantity: {
      type: Number,
      default: 0
    },

    price: {
      type: Number,
      default: 0
    },

    basePrice: {
      type: Number,
      default: 0
    },

    listPrice: {
      type: Number,
      default: 0
    },

    images: {
      type: [String],
      default: []
    }
  },
  {
    _id: false
  }
)

/* ================= PRODUCT ================= */

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    description: {
      type: String,
      default: ""
    },

    category: {
      type: String,
      default: "general",
      lowercase: true,
      trim: true
    },

    productType: {
      type: String,
      enum: PRODUCT_TYPES,
      default: "physical"
    },

    digitalProduct: {
      type: digitalProductSchema,
      default: () => ({})
    },

    brand: {
      type: String,
      default: "Bella Canvas"
    },

    styleCode: {
      type: String,
      default: ""
    },

    variants: {
      type: [variantSchema],
      default: []
    },

    price: {
      type: Number,
      default: 0
    },

    basePrice: {
      type: Number,
      default: 0
    },

    listPrice: {
      type: Number,
      default: 0
    },

    stock: {
      type: Number,
      default: 0
    },

    quantity: {
      type: Number,
      default: 0
    },

    sizes: {
      type: [String],
      set: (arr) => {
        if (!Array.isArray(arr)) return []

        return arr
          .map(normalizeSize)
          .filter(Boolean)
      },
      default: []
    },

    colors: {
      type: [colorSchema],
      default: []
    },

    image: {
      type: String,
      default: ""
    },

    images: {
      type: [String],
      default: []
    },

    active: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
)

/* ================= EXPORT ================= */

const Product =
  mongoose.models.Product || mongoose.model("Product", productSchema)

export default Product