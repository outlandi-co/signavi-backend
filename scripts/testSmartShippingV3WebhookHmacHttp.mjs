import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import vm from "node:vm"
import express from "express"

const source = fs.readFileSync(
  new URL("../routes/squareWebhook.js", import.meta.url),
  "utf8"
)

const startMarker =
  "const verifySignature = (rawBody, signature) => {"
const endMarker =
  "// RETRIEVE VERIFIED PAYMENT DATA FROM SQUARE"

assert.equal(source.split(startMarker).length - 1, 1)
assert.equal(source.split(endMarker).length - 1, 1)

const start = source.indexOf(startMarker)
const end = source.indexOf(endMarker, start)

assert.ok(start >= 0 && end > start)

const key = crypto.randomBytes(32).toString("hex")
const notificationUrl =
  "https://example.invalid/api/square/webhook"

const verifySignature = vm.runInNewContext(
  source.slice(start, end) + "\nverifySignature",
  {
    crypto,
    Buffer,
    process: {
      env: {
        SQUARE_WEBHOOK_SIGNATURE_KEY: key,
        SQUARE_WEBHOOK_URL: notificationUrl
      }
    }
  },
  { timeout: 1000 }
)

assert.equal(typeof verifySignature, "function")

const app = express()
const router = express.Router()

router.post("/webhook", (req, res) => {
  const signature =
    req.headers["x-square-hmacsha256-signature"]

  res.sendStatus(
    verifySignature(req.body, signature) ? 200 : 401
  )
})

app.use(
  "/api/square/webhook",
  express.raw({ type: "application/json" })
)
app.use("/api/square", router)
app.use(express.json({ strict: true, limit: "2mb" }))

const listener = app.listen(0, "127.0.0.1")

try {
  await new Promise((resolve, reject) => {
    if (listener.listening) return resolve()
    listener.once("listening", resolve)
    listener.once("error", reject)
  })

  const url =
    `http://127.0.0.1:${listener.address().port}/api/square/webhook`

  const original = Buffer.from(JSON.stringify({
    type: "payment.updated",
    syntheticTestOnly: true,
    value: 100
  }))

  const modified = Buffer.from(JSON.stringify({
    type: "payment.updated",
    syntheticTestOnly: true,
    value: 900
  }))

  const sign = (body, signedUrl = notificationUrl) =>
    crypto.createHmac("sha256", key)
      .update(signedUrl, "utf8")
      .update(body)
      .digest("base64")

  async function send(body, signature) {
    const headers = { "content-type": "application/json" }

    if (signature !== undefined) {
      headers["x-square-hmacsha256-signature"] = signature
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(5000)
    })

    return response.status
  }

  assert.equal(await send(original, sign(original)), 200)
  console.log("VALID SIGNATURE: PASS")

  assert.equal(await send(modified, sign(original)), 401)
  console.log("MODIFIED PAYLOAD: REJECTED")

  assert.equal(
    await send(original, sign(original, "https://wrong.example.invalid/webhook")),
    401
  )
  console.log("WRONG NOTIFICATION URL: REJECTED")

  assert.equal(await send(original, "invalid-signature"), 401)
  console.log("MALFORMED SIGNATURE: REJECTED")

  assert.equal(await send(original, undefined), 401)
  console.log("MISSING SIGNATURE: REJECTED")

  console.log("ALL PRODUCTION HMAC HTTP SCENARIOS: PASS")
} finally {
  await new Promise((resolve, reject) => {
    listener.close(error =>
      error ? reject(error) : resolve()
    )
  })
}

console.log("LOCALHOST ONLY; NO SQUARE OR DATABASE REQUESTS")