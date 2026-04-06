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

/* 🔥 NEW */
import customerRoutes from "./routes/customers.js"

dotenv.config()

/* ================= PATH FIX ================= */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

/* ================= DEBUG ================= */
app.use((req, res, next) => {
  console.log(`🔥 ${req.method} ${req.originalUrl}`)
  next()
})

/* ================= CORS ================= */
app.use(cors({
  origin: ["http://localhost:5173"],
  credentials: true
}))

/* ================= STRIPE ================= */
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }))

/* ================= MIDDLEWARE ================= */
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
app.use("/api/stripe", stripeRoutes)

/* 🔥 NEW CUSTOMERS ROUTE */
app.use("/api/customers", customerRoutes)

/* ================= SERVER ================= */
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"]
  }
})

app.set("io", io)

io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id)

  socket.on("disconnect", () => {
    console.log("🔴 Socket disconnected:", socket.id)
  })
})

/* ================= START ================= */
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: "signavi_studio"
    })

    console.log("✅ Mongo connected")

    const PORT = process.env.PORT || 5050

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`)
    })

    /* 🔥 BACKGROUND JOB */
    setInterval(() => {
      console.log("🔄 Checking abandoned carts...")
      checkAbandonedCarts()
    }, 1000 * 60 * 10)

  } catch (error) {
    console.error("❌ SERVER ERROR:", error)
    process.exit(1)
  }
}

startServer()