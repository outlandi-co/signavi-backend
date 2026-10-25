import "dotenv/config"

const required = [
  "SQUARE_SANDBOX_ACCESS_TOKEN",
  "SQUARE_SANDBOX_MERCHANT_ID",
  "SQUARE_SANDBOX_LOCATION_ID"
]

console.log("=== V3 SANDBOX CONFIGURATION ===")

console.log(
  "NODE_ENV:",
  ["development", "test"].includes(process.env.NODE_ENV)
    ? "SAFE DEVELOPMENT/TEST"
    : "NOT DEVELOPMENT/TEST"
)

console.log(
  "SQUARE_ENVIRONMENT:",
  process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "SANDBOX"
    : "NOT SANDBOX"
)

console.log(
  "SMART_SHIPPING_V3_ENABLED:",
  process.env.SMART_SHIPPING_V3_ENABLED === "true"
    ? "ENABLED"
    : "DISABLED"
)

console.log(
  "V3 SQUARE CREATION:",
  process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED === "true"
    ? "ENABLED - REVIEW REQUIRED"
    : "DISABLED"
)

let complete = true

for (const name of required) {
  const present =
    typeof process.env[name] === "string" &&
    process.env[name].trim().length > 0

  if (!present) complete = false

  console.log(
    `${name}: ${present ? "CONFIGURED" : "MISSING"}`
  )
}

console.log(
  "SANDBOX CREDENTIAL CONFIGURATION:",
  complete ? "COMPLETE" : "INCOMPLETE"
)

console.log("NO CREDENTIAL VALUES PRINTED")
console.log("NO SQUARE NETWORK REQUESTS")
console.log("NO MONGODB OPERATIONS")
console.log("CONFIGURATION INSPECTION COMPLETE")