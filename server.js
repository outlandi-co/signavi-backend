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
import { SquareClient, SquareEnvironment } from "square"

import { checkAbandonedCarts } from "./services/abandonedCartService.js"

/* ================= ROUTES ================= */
import productRoutes from "./routes/products.js"
import checkoutRoutes from "./routes/checkoutRoutes.js"
import orderRoutes from "./routes/orders.js"
import authRoutes from "./routes/authRoutes.js"
import logoutRoutes from "./routes/logout.js"
import cartRoutes from "./routes/cart.js"
import productionRoutes from "./routes/production.js"
import quoteRoutes from "./routes/quotes.js"
import expenseRoutes from "./routes/expenses.js"
import pricingRoutes from "./routes/pricing.js"
import customerRoutes from "./routes/customers.js"
import aiPricingRoutes from "./routes/aiPricing.js"
import jobRoutes from "./routes/job.js"
import taxRoutes from "./routes/tax.js"
import squareRoutes from "./routes/square.js"

/* ================= PATH ================= */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* ================= APP ================= */
const app = express()
const server = http.createServer(app)

/* ================= DEBUG ================= */
app.use((req, res, next) => {
  console.log(`🔥 ${req.method} ${req.originalUrl}`)
  next()
})

console.log("🚀 SERVER STARTING...")

console.log("📧 EMAIL DEBUG:", {
  user: process.env.EMAIL_USER,
  pass: process.env.EMAIL_PASS ? "exists" : "missing"
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

    console.warn("❌ BLOCKED:", origin)
    return callback(new Error("Not allowed by CORS"))
  },
  credentials: true
}))

/* ================= STATIC ================= */
const uploadsPath = path.join(__dirname, "uploads")

if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true })
}

app.use("/uploads", express.static(uploadsPath))

/* =========================================================
   🔥 IMPORTANT: ROUTE ORDER (FIXES YOUR 500 ERROR)
========================================================= */

/* 🔥 MULTER ROUTES FIRST (NO JSON PARSER YET) */
app.use("/api/quotes", quoteRoutes)
app.use("/api/products", productRoutes)

/* 🔥 THEN ENABLE BODY PARSING */
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

/* 🔥 OTHER ROUTES */
app.use("/api/orders", orderRoutes)
app.use("/api/checkout", checkoutRoutes)
app.use("/api/auth", authRoutes)
app.use("/api/logout", logoutRoutes)
app.use("/api/cart", cartRoutes)
app.use("/api/production", productionRoutes)
app.use("/api/expenses", expenseRoutes)
app.use("/api/pricing", pricingRoutes)
app.use("/api/customers", customerRoutes)
app.use("/api/job", jobRoutes)
app.use("/api/ai-pricing", aiPricingRoutes)
app.use("/api/tax", taxRoutes)
app.use("/api/square", squareRoutes)

console.log("✅ Routes mounted")

/* ================= SQUARE ================= */
const squareClient = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: SquareEnvironment.Production
})

app.get("/api/square/locations", async (req, res) => {
  try {
    const response = await squareClient.locations.list()
    res.json(response)
  } catch (err) {
    console.error("❌ SQUARE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

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
  res.status(404).json({
    message: `Route not found: ${req.originalUrl}`
  })
})

/* ================= SOCKET ================= */
const io = new Server(server, {
  cors: { origin: "*" }
})

app.set("io", io)

io.on("connection", socket => {
  console.log("🟢 Socket connected:", socket.id)
})

/* ================= START ================= */
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log("✅ Mongo connected")

    const PORT = process.env.PORT || 5050

    server.listen(PORT, () => {
      console.log(`🚀 Running on port ${PORT}`)
    })

    /* 🔥 Abandoned Cart Checker */
    setInterval(() => {
      checkAbandonedCarts()
    }, 1000 * 60 * 10)

  } catch (err) {
    console.error("💥 START ERROR:", err)
  }
}

startServer()