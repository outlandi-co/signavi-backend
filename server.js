import express from "express"
import mongoose from "mongoose"
import cors from "cors"
import dotenv from "dotenv"
import cookieParser from "cookie-parser"
import http from "http"
import { Server } from "socket.io"
import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"

/* ================= SERVICES ================= */
import { checkAbandonedCarts } from "./services/abandonedCartService.js"

/* ================= FIX __dirname ================= */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* ================= ROUTES ================= */
import productRoutes from "./routes/products.js"
import checkoutRoutes from "./routes/checkoutRoutes.js"
import orderRoutes from "./routes/orders.js"
import authRoutes from "./routes/authRoutes.js"
import logoutRoutes from "./routes/logout.js"
import stripeRoutes from "./routes/stripe.js"
import cartRoutes from "./routes/cart.js"
import analyticsRoutes from "./routes/analytics.js"
import productionRoutes from "./routes/production.js"
import exportOrdersRoutes from "./routes/exportOrders.js"
import exportTaxesRoutes from "./routes/exportTaxes.js"
import productionSheetRoutes from "./routes/productionSheet.js"
import quoteRoutes from "./routes/quotes.js"
import shippingRoutes from "./routes/shipping.js"
import aiPricingRoutes from "./routes/aiPricing.js"
import abandonedRoutes from "./routes/abandoned.js"
import webhookRoutes from "./routes/webhookRoutes.js"

dotenv.config()

const app = express()

/* ================= DEBUG ================= */
app.use((req, res, next) => {
  console.log(`🔥 ${req.method} ${req.url}`)
  next()
})

/* ================= CORS ================= */
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174"
]

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      console.error("❌ CORS BLOCKED:", origin)
      callback(new Error("CORS not allowed"))
    }
  },
  credentials: true
}))

/* ================= STRIPE WEBHOOK ================= */
app.use("/api/webhook", express.raw({ type: "application/json" }))

/* ================= NORMAL MIDDLEWARE ================= */
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

/* ================= STATIC FILES ================= */
const uploadsPath = path.join(__dirname, "uploads")

if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath)
  console.log("📁 Created uploads folder")
}

console.log("📁 Uploads path:", uploadsPath)

app.use("/uploads", express.static(uploadsPath))

/* ================= ROUTES ================= */
app.use("/api/webhook", webhookRoutes)
app.use("/api/stripe", stripeRoutes)
app.use("/api/products", productRoutes)
app.use("/api/checkout", checkoutRoutes)
app.use("/api/orders", orderRoutes) // 🔥 YOUR EMAIL ROUTE LIVES HERE
app.use("/api/cart", cartRoutes)
app.use("/api/auth", authRoutes)
app.use("/api/logout", logoutRoutes)
app.use("/api/analytics", analyticsRoutes)
app.use("/api/production", productionRoutes)
app.use("/api/quotes", quoteRoutes)
app.use("/api/export-orders", exportOrdersRoutes)
app.use("/api/export-taxes", exportTaxesRoutes)
app.use("/api/production-sheet", productionSheetRoutes)
app.use("/api/shipping", shippingRoutes)
app.use("/api/ai-pricing", aiPricingRoutes)
app.use("/api/abandoned", abandonedRoutes)

/* ================= HEALTH CHECK ================= */
app.get("/", (req, res) => {
  res.send("🚀 Signavi API running")
})

/* ================= SOCKET ================= */
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  },
  transports: ["websocket"]
})

app.set("io", io)

io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id)

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id)
  })
})

/* ================= START ================= */
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
  dbName: "signavi_studio"
})

    console.log("✅ MongoDB connected")

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn("⚠️ EMAIL ENV NOT SET (email will fail)")
    } else {
      console.log("📧 Email system ready")
    }

    const PORT = process.env.PORT || 5050

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`)
    })

    /* ================= ABANDONED CART ENGINE ================= */
    setInterval(() => {
      checkAbandonedCarts()
    }, 1000 * 60 * 10)

  } catch (error) {
    console.error("❌ MongoDB connection error:", error)
    process.exit(1)
  }
}

/* ================= DB ERROR ================= */
mongoose.connection.on("error", err => {
  console.error("❌ Mongo runtime error:", err)
})

startServer()

export { io }