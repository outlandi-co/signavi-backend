
// 🔥 LOAD ENV FIRST (CRITICAL FIX)
import "dotenv/config"

import express from "express"
import cors from "cors"
import mongoose from "mongoose"
import http from "http"
import { Server } from "socket.io"

// ================= ROUTES =================
import quotesRoutes from "./routes/quotes.js"
import ordersRoutes from "./routes/orders.js"
import squareRoutes from "./routes/square.js"
import webhookRoutes from "./routes/webhookRoutes.js"
import productionRoutes from "./routes/production.js"

// ================= APP SETUP =================
const app = express()
const server = http.createServer(app)

// ================= SOCKET =================
const io = new Server(server, {
  cors: {
    origin: "*"
  }
})

app.set("io", io)

// ================= MIDDLEWARE =================
app.use(cors({
  origin: true,
  credentials: true
}))

app.use(express.json())

// 🔥 IMPORTANT: raw body for webhooks (Stripe/Square safety)
app.use("/api/webhook", express.raw({ type: "*/*" }))

// ================= DEBUG =================
console.log("📧 EMAIL DEBUG:", {
  user: process.env.EMAIL_USER,
  pass: process.env.EMAIL_PASS ? "exists" : "missing"
})

// ================= ROUTES =================
console.log("📦 Mounting routes...")

app.use("/api/quotes", quotesRoutes)
app.use("/api/orders", ordersRoutes)
app.use("/api/square", squareRoutes)
app.use("/api/webhook", webhookRoutes)
app.use("/api/production", productionRoutes)

console.log("✅ All routes mounted")

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🚀 SignaVi Backend Running")
})

// ================= MONGO =================
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ Mongo connected"))
.catch(err => console.error("❌ Mongo error:", err))

// ================= SOCKET EVENTS =================
io.on("connection", (socket) => {
  console.log("🟢 Socket:", socket.id)

  socket.on("disconnect", () => {
    console.log("🔴 Socket disconnected:", socket.id)
  })
})

// ================= START =================
const PORT = process.env.PORT || 5050

server.listen(PORT, () => {
  console.log(`🚀 Running on port ${PORT}`)
})