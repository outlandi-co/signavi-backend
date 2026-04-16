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
import { SquareClient, SquareEnvironment } from "square"

import { checkAbandonedCarts } from "./services/abandonedCartService.js"

/* 🔥 ROUTES */
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

/* ================= ENV ================= */
dotenv.config()

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

/* ================= CORS ================= */
const allowedOrigins = [
  "https://signavistudio.store",
  "https://signavi-studio-git-main-signavistudio-9574s-projects.vercel.app",
  "http://localhost:5173"
]

app.use(cors({
  origin: (origin, callback) => {
    console.log("🌐 CORS ORIGIN:", origin)

    if (!origin) return callback(null, true)

    if (origin.includes("vercel.app")) {
      return callback(null, true)
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    console.warn("❌ BLOCKED BY CORS:", origin)
    return callback(new Error("Not allowed by CORS"))
  },
  credentials: true
}))

/* ================= BODY ================= */
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

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
app.use("/api/checkout", checkoutRoutes)
app.use("/api/auth", authRoutes)
app.use("/api/logout", logoutRoutes)
app.use("/api/cart", cartRoutes)
app.use("/api/production", productionRoutes)
app.use("/api/quotes", quoteRoutes)
app.use("/api/expenses", expenseRoutes)
app.use("/api/pricing", pricingRoutes)
app.use("/api/customers", customerRoutes)
app.use("/api/job", jobRoutes)
app.use("/api/ai-pricing", aiPricingRoutes)
app.use("/api/tax", taxRoutes)
app.use("/api/square", squareRoutes)

console.log("✅ Routes mounted")

/* ================= SQUARE DEBUG ================= */
const squareClient = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: SquareEnvironment.Production
})

app.get("/api/square/locations", async (req, res) => {
  try {
    const response = await squareClient.locations.list()

    console.log("📍 SQUARE LOCATIONS:", JSON.stringify(response, null, 2))

    res.json(response)
  } catch (err) {
    console.error("❌ SQUARE LOCATIONS ERROR:", err)
    res.status(500).json({
      message: err.message,
      details: err
    })
  }
})

/* ================= HEALTH ================= */
app.get("/", (req, res) => {
  res.send("🚀 Signavi API running")
})

app.get("/api", (req, res) => {
  res.json({ message: "API OK" })
})

app.get("/api/ping", (req, res) => {
  res.send("pong")
})

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime()
  })
})

app.get("/api/square/__test", (req, res) => {
  res.json({ message: "SQUARE ROUTE LIVE ✅" })
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
  console.log("🟢 Socket:", socket.id)
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

    setInterval(() => {
      checkAbandonedCarts()
    }, 1000 * 60 * 10)

  } catch (err) {
    console.error("💥 START ERROR:", err)
  }
}

startServer()