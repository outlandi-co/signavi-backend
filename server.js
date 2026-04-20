// 🔥 LOAD ENV FIRST (CRITICAL)
import "dotenv/config"

import express from "express"
import mongoose from "mongoose"
import cors from "cors"
import cookieParser from "cookie-parser"
import http from "http"
import { Server } from "socket.io"
import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"

/* ================= ROUTES ================= */
import productRoutes from "./routes/products.js"
import orderRoutes from "./routes/orders.js"
import authRoutes from "./routes/authRoutes.js"
import logoutRoutes from "./routes/logout.js"
import cartRoutes from "./routes/cart.js"
import productionRoutes from "./routes/production.js"
import quoteRoutes from "./routes/quotes.js"
import expenseRoutes from "./routes/expenses.js"
import pricingRoutes from "./routes/pricing.js"
import customerRoutes from "./routes/customers.js"
import squareRoutes from "./routes/square.js"

/* ================= PATH ================= */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* ================= APP ================= */
const app = express()
const server = http.createServer(app)

/* ================= VERSION ================= */
console.log("\n🔥 SERVER VERSION: FINAL STABLE BUILD (NO APPROVE CRASH)\n")

/* ================= ENV DEBUG ================= */
console.log("🔑 ENV CHECK:", {
  mongo: process.env.MONGO_URI ? "exists" : "missing",
  squareToken: process.env.SQUARE_ACCESS_TOKEN ? "exists" : "missing",
  squareLocation: process.env.SQUARE_LOCATION_ID ? "exists" : "missing",
  email: process.env.EMAIL_USER ? "exists" : "missing"
})

/* ================= REQUEST LOGGER ================= */
app.use((req, res, next) => {
  console.log(`🔥 ${req.method} ${req.originalUrl}`)
  next()
})

/* ================= CORS ================= */
const allowedOrigins = [
  "https://signavistudio.store",
  "http://localhost:5173"
]

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (origin.includes("vercel.app")) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)

    console.warn("❌ BLOCKED CORS:", origin)
    return callback(new Error("Not allowed by CORS"))
  },
  credentials: true
}))

/* ================= BODY ================= */
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

/* =========================================================
   🔥 GLOBAL APPROVE SAFETY (FINAL VERSION)
========================================================= */
app.use("/api/quotes/:id/approve", (req, res, next) => {
  console.log("🛠️ APPROVE GUARD HIT")
  console.log("📦 BODY:", req.body)

  try {
    if (!req.body || typeof req.body !== "object") {
      req.body = {}
    }

    let price = Number(req.body.price)

    // 🔥 Always ensure valid price
    if (!price || price <= 0) {
      console.warn("⚠️ No valid price → forcing 25")
      req.body.price = 25
    }

    next()
  } catch (err) {
    console.error("❌ APPROVE GUARD ERROR:", err)
    next() // NEVER block request
  }
})

/* ================= STATIC ================= */
const uploadsPath = path.join(__dirname, "uploads")

if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true })
}

app.use("/uploads", express.static(uploadsPath))

/* ================= ROUTES ================= */
console.log("📦 Mounting routes...")

app.use("/api/products", productRoutes)
app.use("/api/orders", orderRoutes)
app.use("/api/auth", authRoutes)
app.use("/api/logout", logoutRoutes)
app.use("/api/cart", cartRoutes)
app.use("/api/production", productionRoutes)
app.use("/api/quotes", quoteRoutes)
app.use("/api/expenses", expenseRoutes)
app.use("/api/pricing", pricingRoutes)
app.use("/api/customers", customerRoutes)
app.use("/api/square", squareRoutes)

console.log("✅ Routes mounted")

/* ================= HEALTH ================= */
app.get("/", (req, res) => {
  res.send("🚀 Signavi API running")
})

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime()
  })
})

/* ================= 404 ================= */
app.use((req, res) => {
  console.warn("❌ 404 HIT:", req.originalUrl)
  res.status(404).json({
    message: `Route not found: ${req.originalUrl}`
  })
})

/* =========================================================
   🔥 GLOBAL ERROR HANDLER (FINAL)
========================================================= */
app.use((err, req, res, next) => {
  console.error("💥 GLOBAL ERROR FULL:", err)

  res.status(500).json({
    message: err.message || "Server error",
    path: req.originalUrl
  })
})

/* ================= SOCKET ================= */
const io = new Server(server, {
  cors: { origin: "*" }
})

app.set("io", io)

io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id)
})

/* ================= START ================= */
async function startServer() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("Missing MONGO_URI")
    }

    await mongoose.connect(process.env.MONGO_URI)
    console.log("✅ Mongo connected")

    const PORT = process.env.PORT || 5050

    server.listen(PORT, () => {
      console.log(`🚀 Running on port ${PORT}`)
    })

  } catch (err) {
    console.error("💥 START ERROR:", err.message)
  }
}

startServer()