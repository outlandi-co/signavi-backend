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

dotenv.config()

const app = express()

/* ================= DEBUG ================= */
app.use((req, res, next) => {
  console.log(`🔥 ${req.method} ${req.originalUrl}`)
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
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }))

/* ================= NORMAL MIDDLEWARE ================= */
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

/* ================= STATIC FILES ================= */
const uploadsPath = path.join(__dirname, "uploads")

if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true })
}

app.use("/uploads", express.static(uploadsPath))

/* ================= ROUTES ================= */
app.use("/api/stripe", stripeRoutes)
app.use("/api/products", productRoutes)
app.use("/api/checkout", checkoutRoutes)
app.use("/api/orders", orderRoutes)
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

/* 🔥 AI PRICING ROUTE */
app.use("/api/ai-pricing", aiPricingRoutes)
console.log("🤖 AI Pricing ACTIVE")

app.use("/api/abandoned", abandonedRoutes)

/* ================= HEALTH ================= */
app.get("/", (req, res) => {
  res.send("🚀 Signavi API running")
})

/* ================= SOCKET ================= */
const server = http.createServer(app)

const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
  transports: ["websocket"]
})

app.set("io", io)

io.on("connection", (socket) => {
  console.log("🟢 Socket:", socket.id)
})

/* ================= START ================= */
async function startServer() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("❌ MONGO_URI missing in .env")
    }

    await mongoose.connect(process.env.MONGO_URI, {
      dbName: "signavi_studio"
    })

    console.log("✅ Mongo connected")

    const PORT = process.env.PORT || 5050

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Running on ${PORT}`)
})

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use`)
    process.exit(1)
  } else {
    throw err
  }
})

    server
      .listen(PORT, "0.0.0.0", () => {
        console.log(`🚀 Server running on port ${PORT}`)
      })
      .on("error", (err) => {
        if (err.code === "EADDRINUSE") {
          console.error(`❌ Port ${PORT} is already in use`)
          console.log("👉 Run: kill -9 $(lsof -ti :" + PORT + ")")
        } else {
          console.error("❌ Server error:", err)
        }
        process.exit(1)
      })

    /* 🔁 BACKGROUND JOB */
    setInterval(() => {
      console.log("🔄 Checking abandoned carts...")
      checkAbandonedCarts()
    }, 1000 * 60 * 10)

  } catch (error) {
    console.error("❌ SERVER START ERROR:", error)
    process.exit(1)
  }
}

/* ================= DB ERROR ================= */
mongoose.connection.on("error", (err) => {
  console.error("❌ Mongo runtime error:", err)
})

startServer()

export { io }