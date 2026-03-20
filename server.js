import express from "express"
import mongoose from "mongoose"
import cors from "cors"
import dotenv from "dotenv"
import cookieParser from "cookie-parser"
import http from "http"
import { Server } from "socket.io"
import path from "path"
import { fileURLToPath } from "url"

/* FIX __dirname */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* ROUTES */
import productRoutes from "./routes/products.js"
import checkoutRoutes from "./routes/checkoutRoutes.js"
import orderRoutes from "./routes/orders.js"
import webhookRoutes from "./routes/webhookRoutes.js"
import authRoutes from "./routes/authRoutes.js"
import logoutRoutes from "./routes/logout.js"
import stripeRoutes from "./routes/stripe.js"
import cartRoutes from "./routes/cart.js"
import analyticsRoutes from "./routes/analytics.js"
import productionRoutes from "./routes/production.js"
import exportOrdersRoutes from "./routes/exportOrders.js"
import productionSheetRoutes from "./routes/productionSheet.js"
import quoteRoutes from "./routes/quotes.js"

dotenv.config()

const app = express()

/* ================= DEBUG ================= */
app.use((req, res, next) => {
  console.log(`🔥 REQUEST: ${req.method} ${req.url}`)
  next()
})

/* ================= CORS ================= */
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true
}))

/* ================= WEBHOOK ================= */
app.use("/api/webhook", express.raw({ type: "application/json" }))
app.use("/api/webhook", webhookRoutes)

/* ================= MIDDLEWARE ================= */
app.use(express.json())
app.use(cookieParser())

/* ================= STATIC FILES (CRITICAL) ================= */
app.use("/uploads", express.static(path.join(__dirname, "uploads")))

/* ================= DEBUG BODY ================= */
app.use((req, res, next) => {
  if (req.method === "POST") {
    console.log("📦 BODY RECEIVED:", req.body)
  }
  next()
})

/* ================= ROUTES ================= */
app.use("/api/products", productRoutes)
app.use("/api/checkout", checkoutRoutes)
app.use("/api/orders", orderRoutes)
app.use("/api/cart", cartRoutes)
app.use("/api/auth", authRoutes)
app.use("/api/logout", logoutRoutes)
app.use("/api/stripe", stripeRoutes)
app.use("/api/analytics", analyticsRoutes)

app.use("/api/production", productionRoutes)
app.use("/api/quotes", quoteRoutes)

app.use("/api/export-orders", exportOrdersRoutes)
app.use("/api/production-sheet", productionSheetRoutes)

/* ================= TEST ================= */
app.get("/test", (req, res) => {
  res.send("✅ TEST WORKING")
})

app.get("/", (req, res) => {
  res.send("🚀 Signavi API is running")
})

/* ================= SOCKET ================= */
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true
  }
})

app.set("io", io)

io.on("connection", (socket) => {
  console.log("🔥 Client connected:", socket.id)

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id)
  })
})

/* ================= START SERVER ================= */
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: "signavi_store"
    })

    console.log("✅ MongoDB connected")

    const PORT = process.env.PORT || 5050

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`)
    })

  } catch (error) {
    console.error("❌ MongoDB connection error:", error)
    process.exit(1)
  }
}

mongoose.connection.on("error", err => {
  console.error("❌ Mongo runtime error:", err)
})

startServer()

export { io }