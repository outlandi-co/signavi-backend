import { resolveProductCatalogModel } from "../services/resolveProductCatalogModel.js";
import { getProductModelForChannel } from "../models/productModelSelection.js";
import { normalizeOrderItemCustomization } from "../utils/orderItemCustomization.js";
import { resolveCheckoutStorefront } from "../utils/resolveCheckoutStorefront.js"

import express from "express"
import mongoose from "mongoose"
import fetch from "node-fetch"
import Order from "../models/Order.js"
import { applyCheckoutShipping } from "../utils/applyCheckoutShipping.js"
import { getSmartShippingCheckoutVersion } from "../utils/smartShippingV3FeatureFlags.js"
import { prepareV3CheckoutPayment } from "../utils/smartShippingV3PaymentPreparation.js"
import {
  applyV3PreparedPayment,
  verifyV3AppliedPayment
} from "../utils/smartShippingV3ApplyPayment.js"
import { createSquareAuthorization } from "../utils/squarePaymentAuth.js"
import {
  createGuestCheckoutToken,
  verifyGuestCheckoutToken
} from "../utils/guestCheckoutToken.js"

import { resolvePreCatalogStorefrontAttempt } from "../utils/resolvePreCatalogStorefrontAttempt.mjs"
import { verifyStorefrontAttemptIndexReadiness } from "../utils/verifyStorefrontAttemptIndexReadiness.mjs"
import { isStorefrontAttemptDuplicate } from "../utils/storefrontAttemptConflict.mjs"
import Product from "../models/Product.js"
import { calculateCatalogCart } from "../utils/catalogPricing.js"
import { requireAuth } from "../middleware/auth.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import { generateInvoice } from "../utils/generateInvoice.js"
import { createStudioRecoveryHttpHandler } from "../utils/createStudioRecoveryHttpHandler.mjs"
import { sanitizeStorefrontOrderCreation } from "../utils/sanitizeStorefrontOrderCreation.mjs"
import { checkStudioRecoveryThrottle } from "../utils/checkStudioRecoveryThrottle.mjs"
import {
  createStudioPaymentConfirmationHttpHandler
} from "../utils/createStudioPaymentConfirmationHttpHandler.mjs"
import { STOREFRONT_RECOVERY_COUNTER_COLLECTION } from "../utils/verifyStorefrontRecoveryCounterIndex.mjs"
const router = express.Router()
const TAX_RATE = 0.0825

const VALID_STATUSES = new Set([
  "pending",
  "payment_required",
  "paid",
  "ready_for_production",
  "production",
  "pickup_shipping",
  "shipping",
  "shipped",
  "delivered",
  "completed",
  "denied",
  "archive"
])

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Administrator access required"
    })
  }
  next()
}

/* ================= HELPERS ================= */

const num = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const positive = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

const quantity = (value, fallback = 1) => {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1
    ? Math.floor(n)
    : fallback
}

const money = value =>
  Math.round((num(value) + Number.EPSILON) * 100) / 100

const emailOf = value =>
  String(value || "").trim().toLowerCase()

const escapeRegExp = value =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const escapeHtml = value =>
  String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]))

const validId = id =>
  mongoose.Types.ObjectId.isValid(id)

const shippingServiceOf = (rate, fallback = "") =>
  typeof rate?.servicelevel === "string"
    ? rate.servicelevel
    : rate?.servicelevel?.name ||
      rate?.servicelevel?.token ||
      fallback

const emit = (req, name, order) => {
  req.app.get("io")?.emit(name, order)
}

const fail = (res, err, fallback) => {
  console.error(fallback, err)
  return res.status(500).json({
    success: false,
    message: fallback
  })
}
const getOrder = async (req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).json({
      success: false,
      message: "Invalid order ID"
    })
    return null
  }

  const order = await Order.findById(req.params.id)

  if (!order) {
    res.status(404).json({
      success: false,
      message: "Order not found"
    })
    return null
  }

  return order
}

const addr = address => ({
  street: String(address?.street || ""),
  city: String(address?.city || ""),
  state: String(address?.state || ""),
  zip: String(address?.zip || ""),
  country: String(address?.country || "US")
})

const setShipping = (order, amount) => {
  order.shipping = amount
  order.shippingCost = amount
  order.shippingTotal = amount
  order.deliveryFee = amount
}
const getShippingAmount = body =>
  positive(
    body?.shippingCost ??
    body?.shipping ??
    body?.shippingTotal ??
    body?.deliveryFee ??
    body?.shippingRate?.amount,
    0
  )
const getRateId = rate =>
  rate?.id ||
  rate?.object_id ||
  rate?.raw?.object_id ||
  ""

const addTimeline = (order, status, note) => {
  if (!Array.isArray(order.timeline)) {
    order.timeline = []
  }

  order.timeline.push({
    status,
    note,
    date: new Date()
  })
}

const sendStatus = async (
  order,
  status,
  invoicePath
) => {
  if (!order.email) return

  try {
    await sendOrderStatusEmail(
      order.email,
      status,
      order,
      invoicePath
    )
  } catch (err) {
    console.warn(
      "Order email failed:",
      err.message
    )
  }
}

/* ================= GET ALL ORDERS ================= */

router.get(
  "/",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const orders = await Order.find().sort({
        createdAt: -1
      })

      res.json({
        success: true,
        count: orders.length,
        data: orders
      })
    } catch (err) {
      fail(res, err, "Failed to load orders")
    }
  }
)


/* ================= GET CUSTOMER ORDERS ================= */

router.get(
  "/my-orders",
  requireAuth,
  async (req, res) => {
    try {
      const ownEmail = emailOf(req.user?.email)
      const requestedEmail = emailOf(req.query.email)
      const isAdmin = req.user?.role === "admin"

      // Customers must have an authenticated email.
      if (!isAdmin && !ownEmail) {
        return res.status(403).json({
          success: false,
          message: "Authenticated customer email is required"
        })
      }

      // Customers cannot request another customer's orders.
      if (
        !isAdmin &&
        requestedEmail &&
        requestedEmail !== ownEmail
      ) {
        return res.status(403).json({
          success: false,
          message: "You may only view your own orders."
        })
      }

      // Administrators may search by email.
      // Customers always use their authenticated email.
      const email = isAdmin
        ? requestedEmail
        : ownEmail

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required"
        })
      }

      const orders = await Order.find({
        email: {
          $regex: `^${escapeRegExp(email)}$`,
          $options: "i"
        }
      }).sort({
        createdAt: -1
      })

      return res.json({
        success: true,
        count: orders.length,
        data: orders
      })

    } catch (err) {
      return fail(
        res,
        err,
        "Failed to load customer orders"
      )
    }
  }
)


/* ================= PACKING SLIP ================= */

router.get(
  "/:id/packing-slip",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const order = await getOrder(req, res)
      if (!order) return

      const a = order.address || {}

      const lines = (order.items || [])
        .map(item => `
          <tr>
            <td>${escapeHtml(item.name || "Item")}</td>
            <td>
              ${escapeHtml(
                item.variant?.color ||
                item.selectedVariant?.color ||
                "-"
              )}
              /
              ${escapeHtml(
                item.variant?.size ||
                item.selectedVariant?.size ||
                "-"
              )}
            </td>
            <td>${quantity(item.quantity)}</td>
          </tr>
        `)
        .join("")

      res.type("html").send(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Packing Slip</title>
            <style>
              body {
                font: 16px Arial, sans-serif;
                color: #111;
                padding: 40px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
              }
              td, th {
                border: 1px solid #ccc;
                padding: 10px;
                text-align: left;
              }
              th {
                background: #f2f2f2;
              }
              @media print {
                button { display: none; }
              }
            </style>
          </head>
          <body>
            <button onclick="window.print()">
              Print Packing Slip
            </button>

            <h1>SignaVi Studio</h1>
            <h2>Packing Slip</h2>

            <p>
              Order #
              ${escapeHtml(String(order._id).slice(-6))}
            </p>

            <h3>Customer</h3>
            <p>${escapeHtml(order.customerName || "Customer")}</p>
            <p>${escapeHtml(order.email)}</p>
            <p>${escapeHtml(order.phone)}</p>

            <h3>Ship To</h3>
            <p>
              ${escapeHtml(a.street)}<br>
              ${escapeHtml(a.city)},
              ${escapeHtml(a.state)}
              ${escapeHtml(a.zip)}<br>
              ${escapeHtml(a.country || "US")}
            </p>

            <h3>Items</h3>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Variant</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>${lines}</tbody>
            </table>
          </body>
        </html>
      `)
    } catch (err) {
      fail(res, err, "Packing slip failed")
    }
  }
)

/* ================= PRINT ALL ================= */

router.get(
  "/:id/print-all",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const order = await getOrder(req, res)
      if (!order) return

      const base =
        process.env.SERVER_URL ||
        "https://signavi-backend.onrender.com"

      res.json({
        success: true,
        label: order.trackingLabelUrl || "",
        packingSlip:
          `${base}/api/orders/${order._id}/packing-slip`,
        invoice:
          `${base}/api/orders/${order._id}/invoice`
      })
    } catch (err) {
      fail(
        res,
        err,
        "Failed to load print documents"
      )
    }
  }
)

/* ================= DOWNLOAD INVOICE ================= */

router.get(
  "/:id/invoice",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const order = await getOrder(req, res)
      if (!order) return

      const path = await generateInvoice(order)

      res.download(
        path,
        `signavi-invoice-${String(order._id).slice(-6)}.pdf`
      )
    } catch (err) {
      fail(res, err, "Failed to download invoice")
    }
  }
)

/* ================= EMAIL INVOICE ================= */

router.post(
  "/:id/send-invoice",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const order = await getOrder(req, res)
      if (!order) return

      if (!order.email) {
        return res.status(400).json({
          success: false,
          message:
            "Order does not have a customer email"
        })
      }

      const path = await generateInvoice(order)

      await sendOrderStatusEmail(
        order.email,
        "invoice",
        order,
        path
      )

      res.json({
        success: true,
        message: "Invoice sent successfully"
      })
    } catch (err) {
      fail(res, err, "Failed to send invoice")
    }
  }
)

/* ================= CREATE CUSTOM ORDER ================= */

router.post(
  "/custom",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const b = req.body || {}

      if (
        !b.customerName ||
        !b.email ||
        !Array.isArray(b.items) ||
        !b.items.length
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Customer name, email, and at least one item are required"
        })
      }

      const status = b.status || "payment_required"

      if (!VALID_STATUSES.has(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order status"
        })
      }

      const items = b.items.map(item => {
        const price = positive(item?.price, 0)

        return {
          name:
            String(item?.name || "Custom Service").trim(),
          quantity: quantity(item?.quantity),
          price,
          unitPrice:
            positive(item?.unitPrice, price),
          finalPrice:
            positive(item?.finalPrice, price),
          cost:
            positive(item?.cost),
          serviceType:
            String(item?.serviceType || ""),
          source:
            item?.source || "admin",
          variant:
            item?.variant || {}
        }
      })

      const subtotal = money(
        items.reduce(
          (sum, item) =>
            sum + item.price * item.quantity,
          0
        )
      )

      const tax = money(subtotal * TAX_RATE)
      const ship = getShippingAmount(b)

      const order = await Order.create({
        customerName:
          String(b.customerName).trim(),
        email:
          emailOf(b.email),
        phone:
          String(b.phone || ""),
        address:
          addr(b.address),
        items,
        subtotal,
        tax,
        shipping: ship,
        shippingCost: ship,
        shippingTotal: ship,
        deliveryFee: ship,
        finalPrice:
          money(subtotal + tax + ship),
        paymentMethod:
          b.paymentMethod || "",
        notes:
          b.notes || "",
        orderType:
          "custom",
        source:
          "admin",
        status,
        paymentStatus:
          "unpaid",
        timeline: [{
          status,
          note: "Custom order created",
          date: new Date()
        }]
      })

      emit(req, "jobCreated", order)

      res.status(201).json({
        success: true,
        data: order
      })
    } catch (err) {
      fail(res, err, "Failed to create custom order")
    }
  }
)

/* ================= RECEIPT ================= */

router.get(
  "/:id/receipt",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const order = await getOrder(req, res)
      if (!order) return

      if (!order.receiptCreatedAt) {
        order.receiptCreatedAt = new Date()
        await order.save()
      }

      const lines = (order.items || [])
        .map(item => {
          const p = positive(item.price)
          const q = quantity(item.quantity)

          return `
            <tr>
              <td>${escapeHtml(item.name || "Item")}</td>
              <td>${q}</td>
              <td>$${p.toFixed(2)}</td>
              <td>$${money(p * q).toFixed(2)}</td>
            </tr>
          `
        })
        .join("")

      res.type("html").send(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Receipt</title>
            <style>
              body {
                font: 16px Arial, sans-serif;
                color: #111;
                padding: 40px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
              }
              td, th {
                border: 1px solid #ccc;
                padding: 10px;
                text-align: left;
              }
              th {
                background: #f2f2f2;
              }
              @media print {
                button { display: none; }
              }
            </style>
          </head>
          <body>
            <button onclick="window.print()">
              Print / Save Receipt
            </button>

            <h1>SignaVi Studio</h1>
            <h2>Receipt</h2>

            <p>
              Order #
              ${escapeHtml(String(order._id).slice(-6))}
            </p>

            <p>
              Date Created:
              ${escapeHtml(
                order.createdAt
                  ? new Date(order.createdAt).toLocaleString()
                  : ""
              )}
            </p>

            <p>
              Receipt Created:
              ${escapeHtml(
                new Date(order.receiptCreatedAt)
                  .toLocaleString()
              )}
            </p>

            <h3>Customer</h3>
            <p>${escapeHtml(order.customerName || "Customer")}</p>
            <p>${escapeHtml(order.email)}</p>
            <p>${escapeHtml(order.phone)}</p>

            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>${lines}</tbody>
            </table>

            <p>
              Subtotal:
              $${positive(order.subtotal).toFixed(2)}
            </p>
            <p>
              Tax:
              $${positive(order.tax).toFixed(2)}
            </p>
            <p>
              Shipping:
              $${positive(
                order.shippingCost ?? order.shipping
              ).toFixed(2)}
            </p>

            <h3>
              Total:
              $${positive(order.finalPrice).toFixed(2)}
            </h3>

            <p>Status: ${escapeHtml(order.status)}</p>
            <p>
              Payment Method:
              ${escapeHtml(order.paymentMethod || "Online")}
            </p>
          </body>
        </html>
      `)
    } catch (err) {
      fail(res, err, "Failed to generate receipt")
    }
  }
)

/* ================= STUDIO PAYMENT CONFIRMATION ================= */

// Read-only guest confirmation. Never returns the entire order.
// This route is separate from authenticated GET /:id.
router.get(
  "/:id/studio-payment-confirmation",
  createStudioPaymentConfirmationHttpHandler({
    findOrder: id => Order.findById(id),
    verifyGuestToken: verifyGuestCheckoutToken
  })
)
/* ================= GET SINGLE ORDER ================= */

router.get(
  "/:id",
  requireAuth,
  async (req, res) => {
    try {
      const order = await getOrder(req, res)
      if (!order) return

      const isAdmin = req.user?.role === "admin"
      const customerEmail = emailOf(req.user?.email)
      const orderEmail = emailOf(order.email)

      if (
        !isAdmin &&
        (
          !customerEmail ||
          !orderEmail ||
          customerEmail !== orderEmail
        )
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this order"
        })
      }

      return res.json({
        success: true,
        data: order
      })
    } catch (err) {
      return fail(res, err, "Failed to fetch order")
    }
  }
)
/* ================= CREATE STORE ORDER ================= */

// Product prices now come from MongoDB.
//
// IMPORTANT:
// Shippo shipping amounts are not independently
// verified yet. Do not deploy this intermediate
// version until shipping and Square are integrated.

// Studio checkout recovery is deliberately disabled.
// Enable only after HTTP, database, and proxy security review.
const STUDIO_RECOVERY_HTTP_ENABLED = false

const studioRecoveryHandler = createStudioRecoveryHttpHandler({
  checkThrottle: async ({ clientKey, attemptKey }) => {
    const db = mongoose.connection.db

    if (
      mongoose.connection.readyState !== 1 ||
      !db
    ) {
      return { allowed: false }
    }

    const collection = db.collection(
      STOREFRONT_RECOVERY_COUNTER_COLLECTION
    )

    return checkStudioRecoveryThrottle({
      collection,
      clientKey,
      attemptKey
    })
  },

  findOrder: attemptKey =>
    Order.findOne({
      storefrontCreationAttemptKey: attemptKey,
      storefront: "signavi_studio"
    }).lean(),

  issueGuestToken: order =>
    createGuestCheckoutToken(order)
})

router.post(
  "/storefront/recover",
  (req, res, next) => {
    if (!STUDIO_RECOVERY_HTTP_ENABLED) {
      return res.status(404).json({
        success: false,
        message: "Not found."
      })
    }

    if (getSmartShippingCheckoutVersion() !== "v3") {
      return res.status(503).json({
        success: false,
        message: "Checkout recovery unavailable."
      })
    }

    return next()
  },
  studioRecoveryHandler
)
router.post(
  "/",
  async (req, res) => {
    let storefrontCreationMetadata = null

    try {
      const b = req.body || {}

      let checkoutStorefront

      try {
        checkoutStorefront = resolveCheckoutStorefront(b)
      } catch (channelError) {
        return res.status(400).json({
          success: false,
          message: channelError.message
        })
      }

      if (getSmartShippingCheckoutVersion() === "v3") {
        // The index must already exist. Never create it here.
        const readiness =
          await verifyStorefrontAttemptIndexReadiness({
            listIndexes: () => Order.collection.indexes()
          })

        if (readiness.ready !== true) {
          return res.status(503).json({
            success: false,
            message: "Storefront order protection is unavailable."
          })
        }

        const attempt =
          await resolvePreCatalogStorefrontAttempt({
            request: b,
            attemptKey: req.get(
              "x-signavi-storefront-attempt-key"
            ),
            recoverySecret: req.get(
              "x-signavi-storefront-recovery-secret"
            ),
            findByAttemptKey: key =>
              Order.findOne({
                storefrontCreationAttemptKey: key
              }).lean()
          })

        if (
          attempt.state === "denied" ||
          attempt.state ===
            "existing-eligible-for-further-authorization"
        ) {
          return res.status(409).json({
            success: false,
            message:
              "Purchase attempt cannot be created again. " +
              "Contact support before retrying."
          })
        }

        if (
          attempt.state !== "requires-atomic-create" ||
          !attempt.metadata
        ) {
          return res.status(503).json({
            success: false,
            message: "Purchase attempt could not be prepared."
          })
        }

        storefrontCreationMetadata = attempt.metadata
      }

      const email = emailOf(b.email)

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Customer email is required"
        })
      }

      if (
        !Array.isArray(b.items) ||
        b.items.length === 0 ||
        b.items.length > 100
      ) {
        return res.status(400).json({
          success: false,
          message: "Order must contain 1 to 100 items"
        })
      }

      // The browser supplies product IDs, variants,
      // and quantities, but never authoritative prices.

      const productIds = b.items.map((item) =>
        String(
          item?.productId ||
          item?._id ||
          item?.id ||
          item?.product?._id ||
          ""
        ).trim()
      )

      if (
        productIds.some(
          (id) => !/^[a-f0-9]{24}$/i.test(id)
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID in cart"
        })
      }

      const CatalogProduct = resolveProductCatalogModel(checkoutStorefront, {
    legacyModel: Product,
    isolatedModelResolver: getProductModelForChannel
  });

  const products = await CatalogProduct.find({
        _id: {
          $in: [...new Set(productIds)]
        },
        storefront: checkoutStorefront
      })

      let catalog

      try {
        catalog = calculateCatalogCart(products, b.items, checkoutStorefront)
      } catch (pricingError) {
        return res.status(400).json({
          success: false,
          message: pricingError.message
        })
      }

      // All item prices and variant details below
      // were calculated using saved products.


      // Validate customer design data without trusting browser prices.
      let orderCustomizations

      try {
        orderCustomizations = b.items.map((item) =>
          normalizeOrderItemCustomization(item?.customization)
        )
      } catch (customizationError) {
        return res.status(400).json({
          success: false,
          message: customizationError.message
        })
      }

      const items = catalog.items.map((item, index) => ({
        customization: orderCustomizations[index],
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,

        price: item.price,
        unitPrice: item.unitPrice,
        salePrice: item.salePrice,
        finalPrice: item.finalPrice,

        originalPrice: item.originalPrice,
        regularPrice: item.regularPrice,

        discountActive: item.discountActive,
        discountType: item.discountType,
        discountValue: item.discountValue,
        discountLabel: item.discountLabel,

        image: item.image,
        productType: item.productType,

        selectedVariant: item.selectedVariant,
        variant: item.variant,

        source: "store",
        cost: 0
      }))

      const subtotal = money(catalog.subtotal)
      const tax = money(subtotal * TAX_RATE)

      // Initial storefront orders are unpaid and have no trusted
      // shipping rate yet. Only the signed quote in /:id/checkout
      // can set the shipping cost and carrier details.
      const shipping = 0
      const rate = null

      const order = await Order.create({
        ...(storefrontCreationMetadata || {}),
        storefront: checkoutStorefront,
        customerName:
          String(b.customerName || "Customer").trim(),

        email,

        phone:
          String(b.phone || ""),

        address:
          addr(b.address),

        items,
        subtotal,
        tax,

        shipping,
        shippingCost: shipping,
        shippingTotal: shipping,
        deliveryFee: shipping,

        shippingRate: rate,
        shippingRateId: "",
        shippingProvider: "",
        shippingService: "",

        finalPrice:
          money(subtotal + tax + shipping),

        status: "payment_required",
        paymentStatus: "unpaid",

        // Server-issued only; never copied from req.body.
        ...(getSmartShippingCheckoutVersion() === "v3"
          ? {
              v3FirstAttemptProvenanceVersion:
                "storefront-v3-origin-v1",
              v3FirstAttemptProvenanceIssuedAt:
                new Date()
            }
          : {}),

        source: "store",

        timeline: [{
          status: "payment_required",
          note: "Store order created",
          date: new Date()
        }]
      })

      emit(req, "jobCreated", order)

      // Issue a private token for this guest checkout.
      const checkoutToken = createGuestCheckoutToken(order)

      return res.status(201).json({
        success: true,
        data: sanitizeStorefrontOrderCreation(order),
        checkoutToken,
        checkoutVersion: getSmartShippingCheckoutVersion()
      })

    } catch (err) {
      if (
        storefrontCreationMetadata &&
        isStorefrontAttemptDuplicate(err)
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This purchase attempt already exists. " +
            "Contact support before retrying."
        })
      }

      return fail(
        res,
        err,
        "Failed to create store order"
      )
    }
  }
)

/* ================= UPDATE ORDER ================= */

router.patch(
  "/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const order = await getOrder(req, res)
      if (!order) return

      const b = req.body || {}

      if (b.customerName !== undefined) {
        order.customerName =
          String(b.customerName || "").trim()
      }

      if (b.email !== undefined) {
        order.email = emailOf(b.email)
      }

      if (b.phone !== undefined) {
        order.phone = String(b.phone || "").trim()
      }

      if (b.address !== undefined) {
        order.address = {
          ...addr(order.address),
          ...addr({
            ...order.address,
            ...b.address
          })
        }
      }

      const shippingChanged =
        [
          "shipping",
          "shippingCost",
          "shippingTotal",
          "deliveryFee"
        ].some(k => b[k] !== undefined) ||
        b.shippingRate?.amount !== undefined

      if (shippingChanged) {
        setShipping(order, getShippingAmount(b))
      }

      if (b.shippingRate !== undefined) {
        order.shippingRate = b.shippingRate

        order.shippingRateId =
          b.shippingRateId ||
          getRateId(b.shippingRate) ||
          order.shippingRateId ||
          ""

        if (b.shippingProvider === undefined) {
          order.shippingProvider =
            b.shippingRate?.provider ||
            order.shippingProvider ||
            ""
        }

        if (b.shippingService === undefined) {
          order.shippingService = shippingServiceOf(
            b.shippingRate,
            order.shippingService
          )
        }
      }

      if (b.shippingRateId !== undefined) {
        order.shippingRateId = b.shippingRateId || ""
      }

      if (b.shippingProvider !== undefined) {
        order.shippingProvider =
          b.shippingProvider || ""
      }

      if (b.shippingService !== undefined) {
        order.shippingService =
          b.shippingService || ""
      }

      if (b.finalPrice !== undefined) {
        order.finalPrice = money(
          positive(
            b.finalPrice,
            order.finalPrice || 0
          )
        )
      }

      if (b.paymentMethod !== undefined) {
        order.paymentMethod =
          String(b.paymentMethod || "")
      }

      if (b.notes !== undefined) {
        order.notes = String(b.notes || "")
      }

      let statusChanged = false

      if (b.status) {
        if (!VALID_STATUSES.has(b.status)) {
          return res.status(400).json({
            success: false,
            message:
              `Invalid order status: ${b.status}`,
            validStatuses: [...VALID_STATUSES]
          })
        }

        if (order.status !== b.status) {
          const previous = order.status

          order.status = b.status

          addTimeline(
            order,
            b.status,
            b.note ||
              `Order moved from ${previous || "unknown"} to ${b.status}`
          )

          statusChanged = true
        }
      }

      await order.save()

      emit(req, "jobUpdated", order)

      if (statusChanged) {
        await sendStatus(order, order.status)

        if (
          ["payment_required", "shipped"]
            .includes(order.status) &&
          order.email
        ) {
          try {
            const invoicePath =
              await generateInvoice(order)

            await sendStatus(
              order,
              "invoice",
              invoicePath
            )
          } catch (err) {
            console.warn(
              "Invoice generation failed:",
              err.message
            )
          }
        }
      }

      res.json({
        success: true,
        data: order
      })
    } catch (err) {
      fail(res, err, "Failed to update order")
    }
  }
)

/* ================= CHECKOUT ================= */

// WARNING: This route requires a guest ownership token and
// full Square/Shippo integration tests before production deployment.
// Catalog prices are calculated during order creation; this route
// verifies shipping and sends a short-lived internal Square signature.

router.patch(
  "/:id/checkout",
  async (req, res, next) => {
    try {
      const order = await getOrder(req, res)
      if (!order) return

      req.checkoutOrder = order

      const storefront = ["store", "cart_drawer"].includes(
        String(order.source || "").toLowerCase()
      )

      if (storefront) return next()

      return requireAuth(req, res, () => {
        if (req.user?.role !== "admin") {
          return res.status(403).json({
            success: false,
            code: "CHECKOUT_ADMIN_REQUIRED",
            message: "Administrator access required"
          })
        }

        return next()
      })
    } catch (error) {
      return fail(res, error, "Checkout authorization failed")
    }
  },
  async (req, res) => {
    try {
      const order = req.checkoutOrder
      // Verify ownership before changing a storefront order.
      const isStorefrontOrder = ["store", "cart_drawer"].includes(
        String(order.source || "").toLowerCase()
      )

      if (isStorefrontOrder) {
        const guestToken = req.get(
          "x-signavi-guest-checkout-token"
        )

        if (!verifyGuestCheckoutToken(order, guestToken)) {
          return res.status(403).json({
            success: false,
            message:
              "Checkout session invalid or expired. Please restart checkout."
          })
        }
      }


      // Stop checkout for orders that are already paid
      // or no longer awaiting payment.
      if (
        order.paymentStatus === "paid" ||
        !["payment_required", "pending"].includes(order.status)
      ) {
        return res.status(409).json({
          success: false,
          message: "This order cannot be checked out."
        })
      }

      // Verify the signed Shippo quote against
      // the saved order before calling Square.
      // Development-only V3 preview. No database save or Square call.
      if (
        isStorefrontOrder &&
        getSmartShippingCheckoutVersion() === "v3"
      ) {
        // Validate the signed shipping quote before entering
        // the locked production checkout boundary.
        // This does not authorize persistence or Square calls.
        if (
          String(process.env.SQUARE_ENVIRONMENT || "")
            .trim()
            .toLowerCase() !== "sandbox"
        ) {
          const verifiedQuote = prepareV3CheckoutPayment({
            order,
            guestToken: req.get("x-signavi-guest-checkout-token"),
            signedQuote: req.body?.v3ShippingQuote
          })

          if (!verifiedQuote) {
            return res.status(400).json({
              success: false,
              message: "V3 checkout verification failed."
            })
          }
        }

        if (
          String(process.env.SQUARE_ENVIRONMENT || "")
            .trim()
            .toLowerCase() !== "sandbox"
        ) {
          const { denyV3ProductionCheckout } = await import(
            "../utils/denyV3ProductionCheckout.js"
          )

          const gate = denyV3ProductionCheckout()

          // Production V3 remains locked regardless of NODE_ENV.
          // No initialization, Square SDK creation, or payment retry.
          // The trusted coordinator is tested separately until
          // reconciliation and execution integration are verified.
          return res.status(gate.httpStatus).json(gate.body)


        }

        const prepared = prepareV3CheckoutPayment({
          order,
          guestToken: req.get("x-signavi-guest-checkout-token"),
          signedQuote: req.body?.v3ShippingQuote
        })

        if (!prepared) {
          return res.status(400).json({
            success: false,
            message: "V3 checkout verification failed."
          })
        }

        try {
          applyV3PreparedPayment(order, prepared)

          if (!verifyV3AppliedPayment(order, prepared)) {
            throw new Error("Prepared payment mismatch.")
          }
        } catch {
          return res.status(400).json({
            success: false,
            message: "V3 payment preparation failed."
          })
        }

        // Explicitly gated development-only preparation.
        // No Square payment is created here.
        const sandboxHttpEnabled =
          ["development", "test"].includes(
            String(process.env.NODE_ENV || "").toLowerCase()
          ) &&
          String(process.env.SQUARE_ENVIRONMENT || "")
            .trim().toLowerCase() === "sandbox" &&
          String(process.env.SMART_SHIPPING_V3_SANDBOX_PREPARE_ENABLED || "")
            .trim().toLowerCase() === "true" &&
          String(process.env.SMART_SHIPPING_V3_SANDBOX_HTTP_ENABLED || "")
            .trim().toLowerCase() === "true" &&
          req.get("x-signavi-v3-sandbox-mode") === "prepare"

        if (sandboxHttpEnabled) {
          // Explicit internal test path, never a public checkout mode.
          const durableHttpTestEnabled =
            process.env.NODE_ENV === "test" &&
            process.env.SQUARE_ENVIRONMENT === "sandbox" &&
            process.env.SMART_SHIPPING_V3_DURABLE_PREPARE_ENABLED === "true" &&
            process.env.SMART_SHIPPING_V3_CROSS_DATABASE_TEST_ENABLED === "true" &&
            process.env.SMART_SHIPPING_V3_DURABLE_HTTP_TEST_ENABLED === "true" &&
            req.get("x-signavi-v3-sandbox-durable") === "prepare"

          if (durableHttpTestEnabled) {
            const { default: mongoose } = await import("mongoose")

            // Only permit local, explicitly isolated test databases.
            const localTestDatabase =
              !process.env.MONGO_URI &&
              mongoose.connection.db?.databaseName === "signavi_store" &&
              ["127.0.0.1", "localhost", "::1"].includes(
                mongoose.connection.host
              )

            if (!localTestDatabase || order?.source !== "store") {
              return res.status(423).json({
                success: false,
                code: "V3_DURABLE_HTTP_TEST_ISOLATION_REQUIRED",
                paymentCreated: false,
                squareRequestAuthorized: false
              })
            }

            const {
              acquireV3IsolatedCheckoutLock,
              releaseV3IsolatedCheckoutLock
            } = await import("../utils/smartShippingV3CheckoutLock.js")

            const {
              prepareV3AtomicSandboxCheckout
            } = await import("../utils/prepareV3AtomicSandboxCheckout.js")

            const sandboxConnection = mongoose.connection.useDb(
              "signavi_shipping_v3_dev",
              { useCache: true }
            )

            const CheckoutLock =
              sandboxConnection.models.SmartShippingV3CheckoutLock ||
              sandboxConnection.model(
                "SmartShippingV3CheckoutLock",
                new mongoose.Schema({
                  _id: mongoose.Schema.Types.ObjectId,
                  owner: { type: String, required: true },
                  expiresAt: { type: Date, required: true }
                }, {
                  collection: "smart_shipping_v3_checkout_locks",
                  versionKey: false
                })
              )

            const lock = await acquireV3IsolatedCheckoutLock(
              prepared.orderId,
              { CheckoutLock }
            )

            if (!lock) {
              return res.status(409).json({
                success: false,
                code: "V3_SANDBOX_CHECKOUT_ALREADY_LOCKED",
                paymentCreated: false,
                squareRequestAuthorized: false
              })
            }

            try {
              const durable = await prepareV3AtomicSandboxCheckout({
                lock,
                guestToken: req.get("x-signavi-guest-checkout-token"),
                signedQuote: req.body?.v3ShippingQuote,
                storefrontConnection: mongoose.connection,
                sandboxConnection
              })

              if (
                !durable?.success ||
                durable.paymentCreated !== false ||
                durable.squareRequestAuthorized !== false
              ) {
                throw new Error("V3_DURABLE_HTTP_RESULT_REJECTED")
              }

              return res.status(202).json({
                success: true,
                code: "V3_SANDBOX_DURABLE_HTTP_TEST_ONLY",
                orderId: durable.orderId,
                paymentOperationId: durable.paymentOperationId,
                totalCents: durable.amountCents,
                shippingAmountCents: durable.shippingAmountCents,
                paymentCreated: false,
                squareRequestAuthorized: false
              })
            } catch (error) {
              console.error(
                "V3 isolated durable HTTP preparation rejected:",
                error?.message
              )

              return res.status(409).json({
                success: false,
                code: "V3_DURABLE_HTTP_PREPARATION_REJECTED",
                paymentCreated: false,
                squareRequestAuthorized: false
              })
            } finally {
              await releaseV3IsolatedCheckoutLock(
                lock,
                { CheckoutLock }
              )
            }
          }

          // Development preview only. Validation has already
          // completed; do not reserve payment operations or
          // acquire checkout locks without Square execution.
          return res.status(202).json({
            success: true,
            code: "V3_SANDBOX_PREPARED_NO_PAYMENT",
            paymentCreated: false,
            squareRequestAuthorized: false,
            orderId: prepared.orderId,
            totalCents: prepared.totalCents,
            shippingAmountCents: prepared.shippingAmountCents
          })
        }
        return res.status(423).json({
          success: false,
          code: "V3_CHECKOUT_NOT_ACTIVATED",
          reason: "payment_execution_not_authorized",
          message:
            "Secure checkout is not yet available. No payment was created.",
          paymentCreated: false,
          squareRequestAuthorized: false,
          orderId: prepared.orderId,
          preview: {
            totalCents: prepared.totalCents,
            shippingAmountCents: prepared.shippingAmountCents
          }
        })
      }
      try {
        applyCheckoutShipping(order, req.body || {})
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: error.message
        })
      }

      // Square must read the server-calculated
      // shipping amount, not a browser-supplied price.
      await order.save()

      // Call Square through THIS backend instance, not a production URL.
      // This prevents local checkout from contacting the deployed backend.
      const localPort = Number(req.socket?.localPort)
      if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) {
        return res.status(503).json({
          success: false,
          message: "Checkout server port could not be determined."
        })
      }

      const base = `http://127.0.0.1:${localPort}`

      const paymentAuthorization = createSquareAuthorization(order)

      const response = await fetch(
        `${base}/api/square/create-payment/${order._id}`,
        {
          method: "POST",
          headers: {
            "x-signavi-payment-authorization": paymentAuthorization
          }
        }
      )

      const data = await response.json()

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          message:
            data?.message ||
            "Payment checkout failed",
          reason: data?.reason || "payment_checkout_failed"
        })
      }

      const paymentUrl =
        data?.paymentUrl ||
        data?.checkoutUrl ||
        data?.url

      if (!paymentUrl) {
        return res.status(500).json({
          success: false,
          message:
            "Payment URL was not returned"
        })
      }

      order.paymentUrl = paymentUrl

      if (order.status !== "payment_required") {
        order.status = "payment_required"

        addTimeline(
          order,
          "payment_required",
          "Payment checkout created"
        )
      }

      await order.save()

      emit(req, "jobUpdated", order)
if (
  String(process.env.SQUARE_ENVIRONMENT || "")
    .trim()
    .toLowerCase() !== "sandbox"
) {
  await sendStatus(
    order,
    "payment_required"
  )
} else {
  console.log(
    "Sandbox checkout: payment-required email suppressed"
  )
}

      res.json({
        success: true,
        paymentUrl,
        orderId: String(order._id)
      })
    } catch (err) {
      fail(res, err, "Payment checkout failed")
    }
  }
)

/* ================= SHIP ORDER ================= */

router.post(
  "/ship/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const order = await getOrder(req, res)
      if (!order) return

      if (order.status !== "shipped") {
        order.status = "shipped"

        addTimeline(
          order,
          "shipped",
          "Order shipped"
        )
      }

      await order.save()

      emit(req, "jobUpdated", order)

      await sendStatus(order, "shipped")

      res.json({
        success: true,
        data: order
      })
    } catch (err) {
      fail(res, err, "Failed to ship order")
    }
  }
)

// V3 TEST-ONLY RECORDED LINK RELEASE
// Never enable this endpoint for production traffic.
// Square creation is not permitted here.
router.get(
  "/v3-test-only/:orderId/recorded-link",
  async (req, res) => {
    const reject = (status, code) =>
      res.status(status).json({
        success: false,
        code,
        paymentUrl: null
      });

    if (
      process.env.NODE_ENV !== "test" ||
      process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
      process.env.SMART_SHIPPING_V3_CROSS_DATABASE_TEST_ENABLED !== "true" ||
      process.env.SMART_SHIPPING_V3_HTTP_LINK_RELEASE_TEST_ENABLED !== "true" ||
      process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED !== "false"
    ) {
      return reject(423, "V3_LINK_RELEASE_DISABLED");
    }

    const localTestDatabase =
      mongoose.connection.readyState === 1 &&
      mongoose.connection.db?.databaseName === "signavi_store" &&
      ["127.0.0.1", "localhost", "::1"].includes(
        mongoose.connection.host
      );

    if (!localTestDatabase) {
      return reject(423, "V3_TEST_DATABASE_REQUIRED");
    }

    // Injected by trusted in-process acceptance tests only.
    // Never populate these adapters from HTTP request data.
    const readers =
      req.app.locals?.v3SandboxLinkReleaseTestReaders;

    if (
      typeof readers?.readSquareLink !== "function" ||
      typeof readers?.readSquareOrder !== "function" ||
      typeof readers?.expectedLocationId !== "string" ||
      !readers.expectedLocationId.trim()
    ) {
      return reject(423, "V3_TRUSTED_TEST_READERS_REQUIRED");
    }

    try {
      const [
        { createV3CrossDatabaseCheckoutModels },
        { createV3TestOnlyLinkReleaseHandler }
      ] = await Promise.all([
        import("../utils/createV3CrossDatabaseCheckoutModels.js"),
        import("../utils/createV3TestOnlyLinkReleaseHandler.js")
      ]);

      const sandboxConnection = mongoose.connection.useDb(
        "signavi_shipping_v3_dev",
        { useCache: true }
      );

      const models = createV3CrossDatabaseCheckoutModels({
        storefrontConnection: mongoose.connection,
        sandboxConnection
      });

      const handler = createV3TestOnlyLinkReleaseHandler({
        authenticateGuest: async ({ req, order }) => {
          if (order?.source !== "store") return false;

          return verifyGuestCheckoutToken(
            order,
            req.get("x-signavi-guest-checkout-token")
          );
        },

        loadRecords: async ({ orderId }) => {
          const order = await models.StoreOrder
            .findById(orderId)
            .lean();

          if (!order || order.source !== "store") {
            return { order: null };
          }

          const [operation, ownership] = await Promise.all([
            models.SandboxPaymentOperation.findOne({
              orderId
            }).lean(),

            models.SandboxOwnership.findOne({
              environment: "sandbox",
              purchaseKey: `order:${orderId}`
            }).lean()
          ]);

          return { order, operation, ownership };
        },

        readSquareLink: readers.readSquareLink,
        readSquareOrder: readers.readSquareOrder,
        expectedLocationId: readers.expectedLocationId
      });

      return await handler(req, res);
    } catch {
      return reject(503, "V3_LINK_RELEASE_UNAVAILABLE");
    }
  }
);
export default router
