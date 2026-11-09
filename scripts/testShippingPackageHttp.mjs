import "dotenv/config"
import express from "express"
import mongoose from "mongoose"
import jwt from "jsonwebtoken"
import ShippingPackage from "../models/ShippingPackage.js"
import shippingPackagesRoutes from "../routes/shippingPackages.js"

const dbName = "signavi_shipping_v3_dev"

if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
  throw new Error("Missing MongoDB or JWT configuration")
}

const app = express()
app.use(express.json())
app.use("/api/shipping-packages", shippingPackagesRoutes)

let server
let packageId

const request = async (baseUrl, token, method, path, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(data)}`)
  }

  return data
}

try {
  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  if (mongoose.connection.name !== dbName) {
    throw new Error("Unexpected database connection")
  }

  server = app.listen(0, "127.0.0.1")

  await new Promise((resolve, reject) => {
    if (server.listening) return resolve()
    server.once("listening", resolve)
    server.once("error", reject)
  })

  const baseUrl = `http://127.0.0.1:${server.address().port}`

  const token = jwt.sign(
    { id: "v3-http-test-admin", role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "2m" }
  )

  const created = await request(
    baseUrl,
    token,
    "POST",
    "/api/shipping-packages",
    {
      name: "V3 HTTP TEST - Temporary Box",
      carrier: "USPS",
      type: "box",
      lengthIn: 12,
      widthIn: 10,
      heightIn: 4,
      tareWeightOz: 2,
      maxWeightOz: 32,
      verifiedShirtCapacity: 3,
      active: true
    }
  )

  packageId = created.data?._id

  if (!packageId) {
    throw new Error("CREATE returned no package ID")
  }

  console.log("HTTP CREATE: PASS")

  const listed = await request(
    baseUrl,
    token,
    "GET",
    "/api/shipping-packages"
  )

  if (!Array.isArray(listed.data) ||
      !listed.data.some((item) => item._id === packageId)) {
    throw new Error("Created package missing from list")
  }

  console.log("HTTP LIST: PASS")

  await request(
    baseUrl,
    token,
    "PATCH",
    `/api/shipping-packages/${packageId}`,
    { verifiedShirtCapacity: 5 }
  )

  let updated = await ShippingPackage.findById(packageId)

  if (updated?.verifiedShirtCapacity !== 5) {
    throw new Error("UPDATE did not persist")
  }

  console.log("HTTP UPDATE: PASS")

  await request(
    baseUrl,
    token,
    "PATCH",
    `/api/shipping-packages/${packageId}`,
    { active: false }
  )

  updated = await ShippingPackage.findById(packageId)

  if (updated?.active !== false) {
    throw new Error("DEACTIVATE did not persist")
  }

  console.log("HTTP DEACTIVATE: PASS")

} catch (error) {
  console.error("HTTP API TEST FAILED:", error.message)
  process.exitCode = 1
} finally {
  if (packageId && mongoose.connection.readyState === 1) {
    try {
      await ShippingPackage.deleteOne({ _id: packageId })
      console.log("CLEANUP: Temporary package removed")
    } catch (error) {
      console.error("CLEANUP FAILED:", error.message)
      process.exitCode = 1
    }
  }

  if (server) {
    await new Promise((resolve) => server.close(resolve))
  }

  await mongoose.disconnect()
}