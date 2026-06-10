// 🔥 LOAD ENV FIRST
import "dotenv/config"

import express from "express"
import mongoose from "mongoose"
import cookieParser from "cookie-parser"
import http from "http"
import { Server } from "socket.io"
import cors from "cors"
import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"

/* ================= MODELS ================= */

import Order from "./models/Order.js"

/* ================= ROUTES ================= */

import materialRoutes from "./routes/materialRoutes.js"
import supplierRoutes from "./routes/supplierRoutes.js"
import purchaseOrderRoutes from "./routes/purchaseOrderRoutes.js"
import estimateRoutes from "./routes/estimateRoutes.js"

import productRoutes from "./routes/products.js"
import orderRoutes from "./routes/orders.js"
import invoiceRoutes from "./routes/invoiceRoutes.js"

import authRoutes from "./routes/authRoutes.js"
import logoutRoutes from "./routes/logout.js"
import cartRoutes from "./routes/cart.js"
import productionRoutes from "./routes/production.js"
import quoteRoutes from "./routes/quotes.js"
import expenseRoutes from "./routes/expenses.js"
import pricingRoutes from "./routes/pricing.js"
import customerRoutes from "./routes/customers.js"

import squareRoutes from "./routes/square.js"
import squareWebhook from "./routes/squareWebhook.js"
import shippingRoutes from "./routes/shipping.js"

import adminEmailRoutes from "./routes/admin/adminEmailRoutes.js"
import adminEmailWebhookRoutes from "./routes/admin/adminEmailWebhookRoutes.js"

import supportRoutes from "./routes/support/supportRoutes.js"
import aiChatRoutes from "./routes/aiChat.js"
import orderWorkflowRoutes from "./routes/orderWorkflowRoutes.js"
import notificationRoutes from "./routes/notifications.js"

/* ================= PATH SETUP ================= */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const uploadDir =
  process.env.UPLOAD_DIR ||
  path.join(process.cwd(), "uploads")

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

console.log("📁 Upload directory:", uploadDir)

/* ================= APP ================= */

const app = express()
const server = http.createServer(app)

console.log("\n🔥 SERVER READY 🚀\n")

/* ================= CORS ================= */

const allowedOrigins = [
  "https://signavistudio.store",
  "https://www.signavistudio.store",
  "https://signavi.store",
  "https://www.signavi.store",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000"
]

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)

    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    console.warn("❌ CORS BLOCKED:", origin)
    return callback(new Error(`Not allowed by CORS: ${origin}`))
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204
}

app.use(cors(corsOptions))

/* ================= REQUEST DEBUG ================= */

app.use((req, res, next) => {
  console.log("🌐 ORIGIN:", req.headers.origin || "No origin")
  console.log("➡️ REQUEST:", req.method, req.originalUrl)
  next()
})

/* ================= SQUARE WEBHOOK RAW BODY ================= */

app.use(
  "/api/square/webhook",
  express.raw({ type: "application/json" })
)

app.use("/api/square", squareWebhook)

/* ================= JSON ================= */

app.use(express.json({ strict: true, limit: "2mb" }))
app.use(express.urlencoded({ extended: true }))

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    console.error("❌ BAD JSON:", err.message)

    return res.status(400).json({
      success: false,
      message: "Invalid JSON format"
    })
  }

  next()
})

/* ================= MIDDLEWARE ================= */

app.use(cookieParser())

app.use("/uploads", express.static(uploadDir))

app.use(
  "/uploads/proofs",
  express.static(path.join(uploadDir, "proofs"))
)

/* ================= HEALTH ================= */

app.get("/api/ping", (req, res) => {
  res.json({
    success: true,
    message: "SignaVi backend is running"
  })
})

/* ================= CSV HELPERS ================= */

const csvEscape = (value) => {
  if (value === null || value === undefined) return ""

  const stringValue = String(value).replace(/"/g, '""')
  return `"${stringValue}"`
}

const formatCSVDateTime = (value) => {
  if (!value) return ""
  return new Date(value).toLocaleString()
}

const formatCSVDate = (value) => {
  if (!value) return ""
  return new Date(value).toLocaleDateString()
}

const sendCSV = (res, filename, rows) => {
  const csv = rows
    .map((row) => row.map(csvEscape).join(","))
    .join("\n")

  res.setHeader("Content-Type", "text/csv")
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  )
  res.send(csv)
}

/* ================= EXPORT ORDERS CSV ================= */

app.get("/api/orders/export", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })

    const rows = [
      [
        "Order ID",
        "Customer Name",
        "Email",
        "Phone",
        "Status",
        "Payment Status",
        "Payment Method",
        "Square Payment ID",
        "Subtotal",
        "Tax",
        "Shipping",
        "Final Price",
        "COGS",
        "Profit",
        "Margin %",
        "Created At",
        "Paid At",
        "Production Started At",
        "Shipping Started At",
        "Shipped At",
        "Delivered At",
        "Archived At"
      ],
      ...orders.map((order) => [
        order._id,
        order.customerName || "",
        order.email || "",
        order.phone || "",
        order.status || "",
        order.paymentStatus || "",
        order.paymentMethod || "",
        order.squarePaymentId || "",
        Number(order.subtotal || 0).toFixed(2),
        Number(order.tax || 0).toFixed(2),
        Number(order.shipping || 0).toFixed(2),
        Number(order.finalPrice || order.price || 0).toFixed(2),
        Number(order.cogs || 0).toFixed(2),
        Number(order.profit || 0).toFixed(2),
        Number(order.margin || 0).toFixed(2),
        formatCSVDateTime(order.createdAt),
        formatCSVDateTime(order.paidAt),
        formatCSVDateTime(order.customQuotePaidAt),
        formatCSVDateTime(order.shippingStartedAt),
        formatCSVDateTime(order.shippedAt),
        formatCSVDateTime(order.deliveredAt),
        formatCSVDateTime(order.archivedAt)
      ])
    ]

    sendCSV(res, "signavi-orders.csv", rows)
  } catch (err) {
    console.error("❌ ORDERS CSV ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to export orders CSV",
      error: err.message
    })
  }
})

/* ================= EXPORT TAX CSV ================= */

app.get("/api/export-taxes", async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [
        { paymentStatus: "paid" },
        { paidAt: { $ne: null } },
        {
          status: {
            $in: [
              "paid",
              "ready_for_production",
              "production",
              "shipping",
              "shipped",
              "delivered"
            ]
          }
        }
      ]
    }).sort({ paidAt: -1, createdAt: -1 })

    const rows = [
      [
        "Paid Date",
        "Created Date",
        "Order ID",
        "Customer",
        "Email",
        "Payment Status",
        "Payment Method",
        "Square Payment ID",
        "Subtotal",
        "Tax Collected",
        "Shipping",
        "Total Paid",
        "COGS",
        "Estimated Profit",
        "Margin %",
        "Status"
      ],
      ...orders.map((order) => [
        formatCSVDate(order.paidAt),
        formatCSVDate(order.createdAt),
        order._id,
        order.customerName || "",
        order.email || "",
        order.paymentStatus || "",
        order.paymentMethod || "",
        order.squarePaymentId || "",
        Number(order.subtotal || 0).toFixed(2),
        Number(order.tax || 0).toFixed(2),
        Number(order.shipping || 0).toFixed(2),
        Number(order.finalPrice || order.price || 0).toFixed(2),
        Number(order.cogs || 0).toFixed(2),
        Number(order.profit || 0).toFixed(2),
        Number(order.margin || 0).toFixed(2),
        order.status || ""
      ])
    ]

    sendCSV(res, "signavi-tax-report.csv", rows)
  } catch (err) {
    console.error("❌ TAX CSV ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to export tax CSV",
      error: err.message
    })
  }
})

/* ================= ROUTES ================= */

/* ================= MATERIAL CATALOG ================= */

app.use("/api/materials", materialRoutes)
console.log("📦 MATERIAL CATALOG ROUTE MOUNTED")

/* ================= SUPPLIERS ================= */

app.use("/api/suppliers", supplierRoutes)
console.log("🏢 SUPPLIER ROUTE MOUNTED")

/* ================= PURCHASE ORDERS ================= */

app.use("/api/purchase-orders", purchaseOrderRoutes)
console.log("📋 PURCHASE ORDER ROUTE MOUNTED")

/* ================= ESTIMATES / PRODUCTION CALCULATOR ================= */

app.use("/api/estimates", estimateRoutes)
console.log("🧮 ESTIMATE ROUTE MOUNTED")

/* ================= PRODUCTS ================= */

app.use("/api/products", productRoutes)

/* ================= ORDERS ================= */

app.use("/api/orders", orderRoutes)
console.log("🔥 ORDERS ROUTES ACTIVE")

/* ================= INVOICES ================= */

app.use("/api/invoices", invoiceRoutes)
console.log("🧾 INVOICE ROUTE MOUNTED")

/* ================= AUTH ================= */

app.use("/api/auth", authRoutes)
console.log("🔐 AUTH ROUTES LOADED")

app.use("/api/logout", logoutRoutes)

/* ================= CART ================= */

app.use("/api/cart", cartRoutes)

/* ================= PRODUCTION ================= */

app.use("/api/production", productionRoutes)

/* ================= QUOTES ================= */

app.use("/api/quotes", quoteRoutes)
console.log("🔥 QUOTES ROUTE LOADED")

/* ================= EXPENSES / PRICING / CUSTOMERS ================= */

app.use("/api/expenses", expenseRoutes)
app.use("/api/pricing", pricingRoutes)
app.use("/api/customers", customerRoutes)

/* ================= SQUARE ================= */

app.use("/api/square", squareRoutes)
console.log("💳 SQUARE ROUTE LOADED")

/* ================= SHIPPING ================= */

app.use("/api/shipping", shippingRoutes)

/* ================= ORDER WORKFLOW ================= */

app.use("/api/order-workflow", orderWorkflowRoutes)

/* ================= NOTIFICATIONS ================= */

app.use("/api/notifications", notificationRoutes)
console.log("📥 NOTIFICATION ROUTE MOUNTED")

/* ================= AI CHAT ================= */

app.use("/api/ai-chat", aiChatRoutes)
console.log("🤖 AI CHAT ROUTE MOUNTED")

/* ================= ADMIN EMAIL ================= */

app.use("/api/admin-email", adminEmailRoutes)
console.log("📧 ADMIN EMAIL ROUTE MOUNTED")

/* ================= EMAIL WEBHOOKS ================= */

app.use(
  "/api/admin-email-webhook",
  adminEmailWebhookRoutes
)

console.log("📨 ADMIN EMAIL WEBHOOK ROUTE MOUNTED")

/* ================= SUPPORT ================= */

app.use("/api/support", supportRoutes)
console.log("🛟 SUPPORT ROUTE MOUNTED")

/* ================= SOCKET ================= */

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true
  }
})

app.set("io", io)

io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id)

  socket.on("support:new-message", (data) => {
    io.emit("support:new-message", data)
  })

  socket.on("disconnect", () => {
    console.log("🔴 Socket disconnected:", socket.id)
  })
})

/* ================= 404 ================= */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
  })
})

/* ================= ERROR ================= */

app.use((err, req, res, next) => {
  console.error("❌ GLOBAL ERROR:", err)

  res.status(500).json({
    success: false,
    message: "Server error"
  })
})

/* ================= START ================= */

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Mongo connected")

    const PORT = process.env.PORT || 5050

    server.listen(PORT, () => {
      console.log(`🚀 Server running on ${PORT}`)
    })
  })
  .catch((err) => {
    console.error("❌ DB ERROR:", err)
  })