import assert from "node:assert/strict"
import express from "express"
import orderRoutes from "../routes/orders.js"

const app = express()
app.use(express.json())
app.use("/api/orders", orderRoutes)

const server = app.listen(0, "127.0.0.1")

try {
  await new Promise((resolve, reject) => {
    if (server.listening) return resolve()
    server.once("listening", resolve)
    server.once("error", reject)
  })

  const base = `http://127.0.0.1:${server.address().port}`

  const response = await fetch(
    `${base}/api/orders/not-a-valid-object-id/checkout`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    }
  )

  assert.equal(response.status, 400)

  const data = await response.json()

  assert.equal(data.success, false)
  assert.equal(data.message, "Invalid order ID")

  console.log("CHECKOUT INVALID ORDER ID: PASS (400)")
  console.log("REAL EXPRESS HTTP ROUTE: PASS")
  console.log("NO DATABASE CONNECTION REQUIRED: PASS")
  console.log("ALL V3 CHECKOUT HTTP SAFETY TESTS PASSED")

} catch (error) {
  console.error("V3 CHECKOUT HTTP TEST FAILED:", error.message)
  process.exitCode = 1

} finally {
  await new Promise(resolve => server.close(resolve))
}