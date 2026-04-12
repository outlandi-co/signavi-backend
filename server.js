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
const CLIENT_URL =
  process.env.CLIENT_URL || "https://signavi-studio.netlify.app"

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://signavi-studio.netlify.app",
    CLIENT_URL
  ],
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
import productRoutes from "./routes/products.js"
import orderRoutes from "./routes/orders.js"
import authRoutes from "./routes/authRoutes.js"
import productionRoutes from "./routes/production.js"
import quoteRoutes from "./routes/quotes.js"

/* 🔥 ADD THIS LINE */
import squareRoutes from "./routes/square.js"

/* 🔥 DEBUG ROUTE LOAD */
console.log("📦 Loading routes...")

app.use("/api/products", productRoutes)
app.use("/api/orders", orderRoutes)
app.use("/api/auth", authRoutes)
app.use("/api/production", productionRoutes)
app.use("/api/quotes", quoteRoutes)

/* 🔥 ADD THIS LINE */
app.use("/api/square", squareRoutes)

console.log("✅ Routes loaded")

/* ================= TEST ================= */
app.get("/api/orders/__test", (req, res) => {
  res.json({ message: "ORDERS ROUTE LIVE ✅" })
})

app.get("/api/square/__test", (req, res) => {
  res.json({ message: "SQUARE ROUTE LIVE ✅" })
})

/* ================= SOCKET ================= */
const io = new Server(server, {
  cors: {
    origin: "*"
  }
})

app.set("io", io)

/* ================= START ================= */
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log("✅ Mongo connected")

    const PORT = process.env.PORT || 5050

    server.listen(PORT, () => {
      console.log(`🚀 Server running on ${PORT}`)
    })

    setInterval(() => {
      checkAbandonedCarts()
    }, 1000 * 60 * 10)

  } catch (err) {
    console.error("💥 SERVER ERROR:", err)
  }
}

startServer()