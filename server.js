// 🔥 LOAD ENV FIRST
import "dotenv/config"

import express from "express"
import mongoose from "mongoose"
import cookieParser from "cookie-parser"
import http from "http"
import { Server } from "socket.io"
import cors from "cors"
import path from "path"
import { fileURLToPath } from "url"

/* ================= PATH SETUP ================= */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
import shippingRoutes from "./routes/shipping.js"

import adminEmailRoutes from "./routes/admin/adminEmailRoutes.js"

/* 🔥 NEW SUPPORT ROUTES */
import supportRoutes from "./routes/support/supportRoutes.js"

/* ================= WEBHOOK ================= */

import squareWebhook from "./routes/squareWebhook.js"

/* ================= APP ================= */

const app = express()

const server = http.createServer(app)

console.log("\n🔥 SERVER READY 🚀\n")

/* ================= CORS ================= */

const allowedOrigins = [
  "https://signavistudio.store",
  "http://localhost:5173"
]

app.use(
  cors({
    origin: (origin, callback) => {

      if (!origin) {
        return callback(null, true)
      }

      if (
        allowedOrigins.includes(origin)
      ) {
        return callback(null, true)
      }

      console.warn(
        "❌ CORS BLOCKED:",
        origin
      )

      return callback(
        new Error("Not allowed by CORS")
      )
    },

    credentials: true
  })
)

/* =========================================================
   🔥 WEBHOOK MUST COME BEFORE JSON PARSER
========================================================= */

app.use(
  "/api/square/webhook",
  express.raw({
    type: "application/json"
  })
)

app.use(
  "/api/square",
  squareWebhook
)

/* =========================================================
   🔥 SAFE JSON PARSER
========================================================= */

app.use(
  express.json({
    strict: true,
    limit: "2mb"
  })
)

/* ================= BAD JSON ================= */

app.use((err, req, res, next) => {

  if (
    err instanceof SyntaxError &&
    "body" in err
  ) {

    console.error(
      "❌ BAD JSON RECEIVED:",
      err.message
    )

    return res.status(400).json({
      success: false,
      message: "Invalid JSON format"
    })
  }

  next()
})

/* ================= MIDDLEWARE ================= */

app.use(cookieParser())

/* ================= STATIC ================= */

app.use(
  "/uploads",
  express.static(
    path.join(__dirname, "uploads")
  )
)

/* ================= HEALTH ================= */

app.get("/api/ping", (req, res) => {

  res.json({
    success: true,
    message:
      "SignaVi backend is running"
  })
})

/* ================= ROUTES ================= */

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

app.use("/api/shipping", shippingRoutes)

/* ================= ADMIN ================= */

app.use(
  "/api/admin-email",
  adminEmailRoutes
)

console.log(
  "📧 ADMIN EMAIL ROUTE MOUNTED"
)

/* ================= SUPPORT ================= */

app.use(
  "/api/support",
  supportRoutes
)

console.log(
  "🛟 SUPPORT ROUTE MOUNTED"
)

/* ================= SOCKET ================= */

const io = new Server(server, {

  cors: {

    origin: [

      "https://signavistudio.store",

      "http://localhost:5173"
    ],

    methods: [
      "GET",
      "POST"
    ],

    credentials: true,

methods: [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS"
]
  }
})

app.set("io", io)

io.on("connection", socket => {

  console.log(
    "🟢 Socket connected:",
    socket.id
  )
})

/* ================= 404 ================= */

app.use((req, res) => {

  res.status(404).json({
    success: false,
    message:
      `Route not found: ${req.method} ${req.originalUrl}`
  })
})

/* ================= GLOBAL ERROR ================= */

app.use((err, req, res, next) => {

  console.error(
    "❌ GLOBAL ERROR:",
    err
  )

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

    const PORT =
      process.env.PORT || 5050

    server.listen(PORT, () => {

      console.log(
        `🚀 Server running on ${PORT}`
      )
    })
  })

  .catch(err => {

    console.error(
      "❌ DB ERROR:",
      err
    )
  })