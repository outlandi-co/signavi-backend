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

import { checkAbandonedCarts } from "./services/abandonedCartService.js"

/* 🔥 NEW */
import squareRoutes from "./routes/square.js"

/* ================= LOAD ENV ================= */
dotenv.config()

/* ================= CRASH LOGGING ================= */
process.on("uncaughtException", err => {
  console.error("💥 UNCAUGHT EXCEPTION:", err)
})

process.on("unhandledRejection", err => {
  console.error("💥 UNHANDLED REJECTION:", err)
})

/* ================= PATH ================= */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* ================= APP ================= */
const app = express()
const server = http.createServer(app)

/* ================= DEBUG ================= */
app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/api")) {
    console.log(`🔥 ${req.method} ${req.originalUrl}`)
  }
  next()
})

/* ================= ENV DEBUG ================= */
console.log("🌐 ENV CHECK")
console.log("MONGO:", !!process.env.MONGO_URI)
console.log("EMAIL:", !!process.env.EMAIL_USER)
console.log("CLIENT:", process.env.CLIENT_URL)
console.log("SQUARE:", !!process.env.SQUARE_ACCESS_TOKEN)

/* ================= CORS ================= */
const CLIENT_URL =
  process.env.CLIENT_URL || "https://signavi-studio.netlify.app"

const allowedOrigins = [
  "http://localhost:5173",
  "https://signavi-studio.netlify.app",
  "https://signavistudios.netlify.app",
  CLIENT_URL
]

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      console.log("❌ Blocked CORS:", origin)
      callback(null, false)
    }
  },
  credentials: true
}))

/* ================= BODY ================= */
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

/* ================= STATIC ================= */
const uploadsPath = path.join(__dirname, "uploads")
const labelsPath = path.join(__dirname, "labels")

if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true })
}

if (!fs.existsSync(labelsPath)) {
  fs.mkdirSync(labelsPath, { recursive: true })
}

app.use("/uploads", express.static(uploadsPath))
app.use("/api/download", express.static(labelsPath))

/* ================= ROUTES ================= */
import productRoutes from "./routes/products.js"
import checkoutRoutes from "./routes/checkoutRoutes.js"
import orderRoutes from "./routes/orders.js"
import authRoutes from "./routes/authRoutes.js"
import logoutRoutes from "./routes/logout.js"
import stripeRoutes from "./routes/stripe.js"
import cartRoutes from "./routes/cart.js"
import productionRoutes from "./routes/production.js"
import quoteRoutes from "./routes/quotes.js"
import expenseRoutes from "./routes/expenses.js"
import pricingRoutes from "./routes/pricing.js"
import customerRoutes from "./routes/customers.js"
import aiPricingRoutes from "./routes/aiPricing.js"
import jobRoutes from "./routes/job.js"
import taxRoutes from "./routes/tax.js"

console.log("📦 Loading routes...")

app.use("/api/orders", orderRoutes)
app.use("/api/products", productRoutes)
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

/* 🔥 KEEP STRIPE (OPTIONAL SAFE) */
app.use("/api/stripe", stripeRoutes)

/* 🔥 ADD SQUARE */
app.use("/api/square", squareRoutes)

console.log("✅ Routes loaded")

/* ================= HEALTH ================= */
app.get("/", (req, res) => {
  res.send("🚀 Signavi API running")
})

app.get("/api", (req, res) => {
  res.json({
    message: "API root",
    status: "ok"
  })
})

/* 🔥 ADD PING (fix cold start UX) */
app.get("/api/ping", (req, res) => {
  res.send("pong")
})

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    time: new Date()
  })
})

/* ================= ERROR ================= */
app.use((err, req, res, next) => {
  console.error("❌ GLOBAL ERROR:", err)
  res.status(err.status || 500).json({
    message: err.message || "Server error"
  })
})

/* ================= SOCKET ================= */
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
})

app.set("io", io)

io.on("connection", socket => {
  console.log("🟢 Socket connected:", socket.id)

  socket.on("disconnect", () => {
    console.log("🔴 Socket disconnected:", socket.id)
  })
})

/* ================= START ================= */
async function startServer() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI missing in ENV")
    }

    await mongoose.connect(process.env.MONGO_URI, {
      dbName: "signavi_studio"
    })

    console.log("✅ Mongo connected")

    const PORT = process.env.PORT || 5050

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`)
    })

    setInterval(() => {
      try {
        console.log("🔄 Checking abandoned carts...")
        checkAbandonedCarts()
      } catch (err) {
        console.error("❌ Cart job error:", err)
      }
    }, 1000 * 60 * 10)

  } catch (error) {
    console.error("💥 SERVER START ERROR:", error)
  }
}

startServer()