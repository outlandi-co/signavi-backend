import mongoose from "mongoose"

/* =========================================================
   CONSTANTS
========================================================= */

const TAX_RATE = 0.0825

/* =========================================================
   ITEM SCHEMA
========================================================= */

const itemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null
    },

    name: {
      type: String,
      default: "",
      trim: true
    },

    quantity: {
      type: Number,
      default: 1,
      min: 1
    },

    price: {
      type: Number,
      default: 0,
      min: 0
    },

    unitPrice: {
      type: Number,
      default: 0,
      min: 0
    },

    salePrice: {
      type: Number,
      default: 0,
      min: 0
    },

    finalPrice: {
      type: Number,
      default: 0,
      min: 0
    },

    cost: {
      type: Number,
      default: 0,
      min: 0
    },

    image: {
      type: String,
      default: ""
    },

    productType: {
      type: String,
      default: "physical",
      trim: true
    },

    serviceType: {
      type: String,
      default: "",
      trim: true
    },

    source: {
      type: String,
      default: "store",
      trim: true
    },

    selectedVariant: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    variant: {
      color: {
        type: String,
        default: "",
        lowercase: true,
        trim: true
      },

      size: {
        type: String,
        default: "",
        uppercase: true,
        trim: true
      }
    }
  },
  {
    _id: false
  }
)

/* =========================================================
   ARTWORK SCHEMA
========================================================= */

const artworkSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true
    },

    public_id: {
      type: String,
      default: "",
      trim: true
    },

    filename: {
      type: String,
      default: "",
      trim: true
    }
  },
  {
    _id: false
  }
)

/* =========================================================
   TIMELINE SCHEMA
========================================================= */

const timelineSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      default: "",
      trim: true
    },

    date: {
      type: Date,
      default: Date.now
    },

    note: {
      type: String,
      default: "",
      trim: true
    }
  },
  {
    _id: false
  }
)

/* =========================================================
   ORDER SCHEMA
========================================================= */

const orderSchema = new mongoose.Schema(
  {
    /* ================= USER ================= */

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    /* ================= CUSTOMER ================= */

    customerName: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },

    phone: {
      type: String,
      default: "",
      trim: true
    },

    /* ================= ADDRESS ================= */

    address: {
      street: {
        type: String,
        default: "",
        trim: true
      },

      city: {
        type: String,
        default: "",
        trim: true
      },

      state: {
        type: String,
        default: "",
        trim: true
      },

      zip: {
        type: String,
        default: "",
        trim: true
      },

      country: {
        type: String,
        default: "US",
        trim: true
      }
    },

    /* ================= QUOTE CONNECTION ================= */

    quoteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quote",
      default: null,
      index: true
    },

    /* ================= ORDER DETAILS ================= */

    quantity: {
      type: Number,
      default: 1,
      min: 1
    },

    printType: {
      type: String,
      default: "screenprint",
      trim: true
    },

    /* ================= ARTWORK ================= */

    artworks: {
      type: [artworkSchema],
      default: []
    },

    artwork: {
      type: String,
      default: ""
    },

    /* ================= ITEMS ================= */

    items: {
      type: [itemSchema],
      default: []
    },

    /* ================= PRICING ================= */

    subtotal: {
      type: Number,
      default: 0,
      min: 0
    },

    tax: {
      type: Number,
      default: 0,
      min: 0
    },

    shipping: {
      type: Number,
      default: 0,
      min: 0
    },

    shippingCost: {
      type: Number,
      default: 0,
      min: 0
    },

    shippingTotal: {
      type: Number,
      default: 0,
      min: 0
    },

    deliveryFee: {
      type: Number,
      default: 0,
      min: 0
    },

    finalPrice: {
      type: Number,
      default: 0,
      min: 0
    },

    /* ================= PROFIT ================= */

    cogs: {
      type: Number,
      default: 0,
      min: 0
    },

    profit: {
      type: Number,
      default: 0
    },

    margin: {
      type: Number,
      default: 0
    },

    /* ================= SHIPPING ================= */

    shippingRate: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    shippingRateId: {
      type: String,
      default: "",
      trim: true
    },

    shippingProvider: {
      type: String,
      default: "",
      trim: true
    },

    shippingService: {
      type: String,
      default: "",
      trim: true
    },

    trackingNumber: {
      type: String,
      default: "",
      trim: true
    },

    trackingLink: {
      type: String,
      default: "",
      trim: true
    },

    trackingLabelUrl: {
      type: String,
      default: "",
      trim: true
    },

    /* ================= ORDER TYPE ================= */

    orderType: {
      type: String,

      enum: [
        "store",
        "custom",
        "quote"
      ],

      default: "store",
      index: true
    },

    /* ================= SOURCE ================= */

    source: {
      type: String,

      enum: [
        "store",
        "quote",
        "admin",
        "custom",
        "cart_drawer",
        "cart_page"
      ],

      default: "store",
      index: true
    },

    /* ================= PAYMENT ================= */

    paymentMethod: {
      type: String,
      default: "",
      trim: true
    },

    paymentStatus: {
      type: String,

      enum: [
        "unpaid",
        "paid",
        "refunded"
      ],

      default: "unpaid",
      index: true
    },

    paymentUrl: {
      type: String,
      default: ""
    },

    squarePaymentId: {
      type: String,
      default: "",
      trim: true
    },

    currency: {
      type: String,
      default: "usd",
      lowercase: true,
      trim: true
    },

    /* ================= NOTES ================= */

    notes: {
      type: String,
      default: "",
      trim: true
    },

    /* ================= WORKFLOW ================= */

    status: {
      type: String,

      enum: [
        /*
         * CURRENT ORDER WORKFLOW
         */

        "pending",

        "payment_required",

        "paid",

        "production",

        "pickup_shipping",

        "shipping",

        "shipped",

        "delivered",

        "completed",

        "denied",

        "archive",

        /*
         * LEGACY STATUS SUPPORT
         *
         * Existing database records may still
         * contain these statuses.
         *
         * New routes should NOT create them.
         */

        "quotes",

        "ready_for_production"
      ],

      default: "payment_required",
      index: true
    },

    printStatus: {
      type: String,
      default: "",
      trim: true
    },

    /* ================= TIMELINE ================= */

    timeline: {
      type: [timelineSchema],
      default: []
    },

    /* ================= DOCUMENT DATES ================= */

    invoiceCreatedAt: {
      type: Date,
      default: null
    },

    receiptCreatedAt: {
      type: Date,
      default: null
    },

    receiptEmailSent: {
      type: Boolean,
      default: false
    },

    receiptEmailSentAt: {
      type: Date,
      default: null
    },

    /* ================= PAYMENT DATES ================= */

    paidAt: {
      type: Date,
      default: null
    },

    customQuotePaidAt: {
      type: Date,
      default: null
    },

    paymentUrlCreatedAt: {
      type: Date,
      default: null
    },

    /* ================= PRODUCTION DATES ================= */

    productionStartedAt: {
      type: Date,
      default: null
    },

    pickupShippingStartedAt: {
      type: Date,
      default: null
    },

    /* ================= SHIPPING DATES ================= */

    shippingStartedAt: {
      type: Date,
      default: null
    },

    shippedAt: {
      type: Date,
      default: null
    },

    deliveredAt: {
      type: Date,
      default: null
    },

    /* ================= COMPLETION ================= */

    completedAt: {
      type: Date,
      default: null
    },

    archivedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
)

/* =========================================================
   HELPER FUNCTIONS
========================================================= */

const safeNumber = (
  value,
  fallback = 0
) => {
  const number = Number(value)

  return Number.isFinite(number)
    ? number
    : fallback
}

const safePositiveNumber = (
  value,
  fallback = 0
) => {
  const number = Number(value)

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return fallback
  }

  return number
}

const roundMoney = (
  value
) => {
  return Number(
    safeNumber(
      value,
      0
    ).toFixed(2)
  )
}

/* =========================================================
   AUTO ENGINE
========================================================= */

orderSchema.pre(
  "save",
  function () {
    /* =====================================================
       NORMALIZE EMAIL
    ===================================================== */

    if (this.email) {
      this.email =
        String(this.email)
          .trim()
          .toLowerCase()
    }

    /* =====================================================
       QUOTE ORDER DETECTION
    ===================================================== */

    if (
      this.source === "quote" ||
      this.quoteId
    ) {
      this.orderType =
        "quote"
    }

    /* =====================================================
       ITEM SUBTOTAL
    ===================================================== */

    let calculatedItemSubtotal =
      0

    if (
      Array.isArray(this.items) &&
      this.items.length > 0
    ) {
      calculatedItemSubtotal =
        this.items.reduce(
          (
            sum,
            item
          ) => {
            const price =
              safePositiveNumber(
                item.finalPrice ||
                item.salePrice ||
                item.unitPrice ||
                item.price ||
                item.selectedVariant
                  ?.price ||
                0,
                0
              )

            const quantity =
              Math.max(
                1,
                safeNumber(
                  item.quantity,
                  1
                )
              )

            return (
              sum +
              price *
              quantity
            )
          },
          0
        )
    }

    /*
     * IMPORTANT:
     *
     * Store/cart orders normally calculate
     * subtotal directly from item prices.
     *
     * Quote orders can contain descriptive
     * items whose prices are $0 while the
     * approved quote total is stored directly
     * on subtotal.
     *
     * Do not overwrite an explicit quote
     * subtotal with zero.
     */

    const existingSubtotal =
      safePositiveNumber(
        this.subtotal,
        0
      )

    if (
      calculatedItemSubtotal > 0
    ) {
      /*
       * For normal store/custom orders,
       * item totals are authoritative.
       *
       * For quote orders, preserve an
       * explicitly supplied approved subtotal.
       */

      if (
        this.source === "quote" ||
        this.quoteId
      ) {
        if (
          existingSubtotal <= 0
        ) {
          this.subtotal =
            calculatedItemSubtotal
        }
      } else {
        this.subtotal =
          calculatedItemSubtotal
      }
    } else if (
      existingSubtotal > 0
    ) {
      this.subtotal =
        existingSubtotal
    } else {
      this.subtotal = 0
    }

    /* =====================================================
       SHIPPING
    ===================================================== */

    const selectedShipping =
      safePositiveNumber(
        this.shippingCost ||
        this.shipping ||
        this.shippingTotal ||
        this.deliveryFee ||
        this.shippingRate
          ?.amount ||
        0,
        0
      )

    this.shipping =
      selectedShipping

    this.shippingCost =
      selectedShipping

    this.shippingTotal =
      selectedShipping

    this.deliveryFee =
      selectedShipping

    /* =====================================================
       TAX
    ===================================================== */

    const existingTax =
      safePositiveNumber(
        this.tax,
        0
      )

    /*
     * Preserve tax if the route explicitly
     * calculated it.
     *
     * Otherwise calculate California sales tax.
     */

    if (
      existingTax > 0
    ) {
      this.tax =
        existingTax
    } else {
      this.tax =
        safePositiveNumber(
          this.subtotal,
          0
        ) *
        TAX_RATE
    }

    /* =====================================================
       FINAL PRICE
    ===================================================== */

    this.finalPrice =
      safePositiveNumber(
        this.subtotal,
        0
      ) +
      safePositiveNumber(
        this.tax,
        0
      ) +
      selectedShipping

    /* =====================================================
       TIMELINE
    ===================================================== */

    if (
      !Array.isArray(
        this.timeline
      )
    ) {
      this.timeline = []
    }

    if (
      this.timeline.length === 0
    ) {
      this.timeline.push({
        status:
          this.status,

        date:
          new Date(),

        note:
          "Order created"
      })
    }

    /* =====================================================
       STATUS AUTOMATION
    ===================================================== */

    if (
      this.isModified(
        "status"
      )
    ) {
      const now =
        new Date()

      switch (
        this.status
      ) {
        case "payment_required":
          if (
            !this.paymentUrlCreatedAt &&
            this.paymentUrl
          ) {
            this.paymentUrlCreatedAt =
              now
          }

          break

        case "paid":
          if (!this.paidAt) {
            this.paidAt =
              now
          }

          this.paymentStatus =
            "paid"

          if (
            (
              this.source ===
                "quote" ||
              this.quoteId
            ) &&
            !this.customQuotePaidAt
          ) {
            this.customQuotePaidAt =
              now
          }

          break

        case "production":
          if (
            !this.productionStartedAt
          ) {
            this.productionStartedAt =
              now
          }

          break

        case "pickup_shipping":
          if (
            !this.pickupShippingStartedAt
          ) {
            this.pickupShippingStartedAt =
              now
          }

          break

        case "shipping":
          if (
            !this.shippingStartedAt
          ) {
            this.shippingStartedAt =
              now
          }

          break

        case "shipped":
          if (!this.shippedAt) {
            this.shippedAt =
              now
          }

          break

        case "delivered":
          if (
            !this.deliveredAt
          ) {
            this.deliveredAt =
              now
          }

          break

        case "completed":
          if (
            !this.completedAt
          ) {
            this.completedAt =
              now
          }

          break

        case "archive":
          if (
            !this.archivedAt
          ) {
            this.archivedAt =
              now
          }

          break

        default:
          break
      }
    }

    /* =====================================================
       COGS
    ===================================================== */

    const existingCogs =
      safePositiveNumber(
        this.cogs,
        0
      )

    if (
      existingCogs <= 0
    ) {
      this.cogs =
        (this.items || [])
          .reduce(
            (
              sum,
              item
            ) => {
              const quantity =
                Math.max(
                  1,
                  safeNumber(
                    item.quantity,
                    1
                  )
                )

              const explicitCost =
                safePositiveNumber(
                  item.cost,
                  0
                )

              /*
               * Use the real product cost when
               * one exists.
               */

              if (
                explicitCost > 0
              ) {
                return (
                  sum +
                  explicitCost *
                  quantity
                )
              }

              /*
               * Existing fallback:
               * estimate cost as 40% of sale price.
               */

              const itemPrice =
                safePositiveNumber(
                  item.finalPrice ||
                  item.salePrice ||
                  item.unitPrice ||
                  item.price ||
                  0,
                  0
                )

              const estimatedCost =
                itemPrice *
                0.4

              return (
                sum +
                estimatedCost *
                quantity
              )
            },
            0
          )
    }

    /* =====================================================
       PROFIT / MARGIN
    ===================================================== */

    this.profit =
      safeNumber(
        this.finalPrice,
        0
      ) -
      safeNumber(
        this.cogs,
        0
      )

    this.margin =
      this.finalPrice > 0
        ? (
            this.profit /
            this.finalPrice
          ) *
          100
        : 0

    /* =====================================================
       MONEY ROUNDING
    ===================================================== */

    this.subtotal =
      roundMoney(
        this.subtotal
      )

    this.tax =
      roundMoney(
        this.tax
      )

    this.shipping =
      roundMoney(
        this.shipping
      )

    this.shippingCost =
      roundMoney(
        this.shippingCost
      )

    this.shippingTotal =
      roundMoney(
        this.shippingTotal
      )

    this.deliveryFee =
      roundMoney(
        this.deliveryFee
      )

    this.finalPrice =
      roundMoney(
        this.finalPrice
      )

    this.cogs =
      roundMoney(
        this.cogs
      )

    this.profit =
      roundMoney(
        this.profit
      )

    this.margin =
      roundMoney(
        this.margin
      )
  }
)

/* =========================================================
   INDEXES
========================================================= */

orderSchema.index({
  createdAt: -1
})

orderSchema.index({
  status: 1,
  createdAt: -1
})

orderSchema.index({
  email: 1,
  createdAt: -1
})

orderSchema.index({
  source: 1,
  status: 1
})

orderSchema.index({
  quoteId: 1,
  status: 1
})

orderSchema.index({
  paymentStatus: 1,
  createdAt: -1
})

/* =========================================================
   MODEL
========================================================= */

const Order =
  mongoose.models.Order ||
  mongoose.model(
    "Order",
    orderSchema
  )

export default Order