import "dotenv/config"
import express from "express"
import shippingPackagesRoutes from "../routes/shippingPackages.js"

const app = express()
app.use(express.json())
app.use("/api/shipping-packages", shippingPackagesRoutes)

const server = app.listen(0, "127.0.0.1")

await new Promise((resolve, reject) => {
  if (server.listening) {
    resolve()
    return
  }

  server.once("listening", resolve)
  server.once("error", reject)
})

try {
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`

  const noToken = await fetch(`${baseUrl}/api/shipping-packages`)

  if (noToken.status !== 401) {
    throw new Error(`Expected 401 without token, got ${noToken.status}`)
  }

  console.log("NO TOKEN: PASS (401)")

  const invalidToken = await fetch(`${baseUrl}/api/shipping-packages`, {
    headers: {
      Authorization: "Bearer invalid-test-token"
    }
  })

  if (invalidToken.status !== 401) {
    throw new Error(`Expected 401 with invalid token, got ${invalidToken.status}`)
  }

  console.log("INVALID TOKEN: PASS (401)")
} catch (error) {
  console.error("AUTH TEST FAILED:", error.message)
  process.exitCode = 1
} finally {
  await new Promise((resolve) => server.close(resolve))
}