// 🔥 LOAD ENV FIRST
import "dotenv/config"

import express from "express"
import mongoose from "mongoose"
import cors from "cors"
import cookieParser from "cookie-parser"
import http from "http"
import { Server } from "socket.io"

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

/* ================= APP ================= */
const app = express()
const server = http.createServer(app)

/* ================= LOG ================= */
console.log("\n🔥 SERVER READY 🚀\n")

/* ================= CORS (FIRST!) ================= */
app.use(cors({
  origin: true, // 🔥 allow dynamic origins (BEST FOR DEV)
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}))

/* ================= MIDDLEWARE ================= */
app.use(express.json())
app.use(cookieParser())

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

/* ================= SOCKET ================= */
const io = new Server(server, {
  cors: {
    origin: true
  }
})

app.set("io", io)

io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id)
})

/* ================= START ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Mongo connected")

    const PORT = process.env.PORT || 5050

    server.listen(PORT, () => {
      console.log(`🚀 Server running on ${PORT}`)
    })
  })
  .catch(err => console.error("❌ DB ERROR:", err))