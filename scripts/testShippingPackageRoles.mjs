import "dotenv/config"
import express from "express"
import jwt from "jsonwebtoken"
import shippingPackagesRoutes from "../routes/shippingPackages.js"

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is missing")
}

const app = express()
app.use(express.json())
app.use("/api/shipping-packages", shippingPackagesRoutes)

const server = app.listen(0, "127.0.0.1")

try {
  await new Promise((resolve, reject) => {
    if (server.listening) return resolve()
    server.once("listening", resolve)
    server.once("error", reject)
  })

  const baseUrl = `http://127.0.0.1:${server.address().port}`

  const customerToken = jwt.sign(
    { id: "v3-test-customer", role: "customer" },
    process.env.JWT_SECRET,
    { expiresIn: "2m" }
  )

  const customerResponse = await fetch(
    `${baseUrl}/api/shipping-packages`,
    { headers: { Authorization: `Bearer ${customerToken}` } }
  )

  if (customerResponse.status !== 403) {
    throw new Error(`Customer expected 403, got ${customerResponse.status}`)
  }

  console.log("CUSTOMER ACCESS: PASS (403)")

  const adminToken = jwt.sign(
    { id: "v3-test-admin", role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "2m" }
  )

  // Use a nonexistent package ID to test authorized route
  // access without querying MongoDB or changing records.
  const adminResponse = await fetch(
    `${baseUrl}/api/shipping-packages/not-a-valid-id`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ active: false })
    }
  )

  if (adminResponse.status === 401 || adminResponse.status === 403) {
    throw new Error(
      `Administrator unexpectedly rejected: ${adminResponse.status}`
    )
  }

  console.log(
    "ADMIN AUTHORIZATION: PASS (not rejected by authentication)"
  )

} catch (error) {
  console.error("ROLE TEST FAILED:", error.message)
  process.exitCode = 1
} finally {
  await new Promise((resolve) => server.close(resolve))
}