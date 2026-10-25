import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

const types = new Set([
  "square_api_error",
  "timeout",
  "unknown_exception"
])

const categories = new Set([
  "API_ERROR",
  "AUTHENTICATION_ERROR",
  "INVALID_REQUEST_ERROR",
  "RATE_LIMIT_ERROR",
  "PAYMENT_METHOD_ERROR",
  "REFUND_ERROR"
])

const codes = new Set([
  "INVALID_VALUE",
  "INVALID_ARRAY_VALUE",
  "INVALID_ENUM_VALUE",
  "INVALID_FORM_VALUE",
  "INVALID_CONTENT_TYPE",
  "INVALID_LOCATION",
  "MISSING_REQUIRED_PARAMETER",
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN"
])

const fields = new Set([
  "order.location_id",
  "order.reference_id",
  "order.line_items",
  "order.line_items[0].name",
  "order.line_items[0].quantity",
  "order.line_items[0].base_price_money",
  "order.line_items[0].base_price_money.amount",
  "order.line_items[0].base_price_money.currency",
  "checkout_options.redirect_url",
  "checkout_options.ask_for_shipping_address",
  "idempotency_key"
])

export const sanitizeV3PersistedSquareDiagnostic = diagnostic => {
  if (
    !diagnostic ||
    !types.has(diagnostic.type) ||
    diagnostic.outcomeKnown !== false
  ) {
    throw new Error("Invalid Square diagnostic.")
  }

  const apiError = diagnostic.type === "square_api_error"

  return Object.freeze({
    type: diagnostic.type,
    httpStatus:
      apiError &&
      Number.isInteger(diagnostic.statusCode) &&
      diagnostic.statusCode >= 400 &&
      diagnostic.statusCode <= 599
        ? diagnostic.statusCode
        : null,
    category:
      apiError && categories.has(diagnostic.category)
        ? diagnostic.category
        : "",
    code:
      apiError && codes.has(diagnostic.code)
        ? diagnostic.code
        : "",
    field:
      apiError &&
      categories.has(diagnostic.category) &&
      codes.has(diagnostic.code) &&
      fields.has(diagnostic.field)
        ? diagnostic.field
        : "",
    outcomeKnown: false
  })
}

export const persistV3SquareDiagnostic = async ({
  orderId,
  owner,
  diagnostic
}) => {
  if (
    typeof orderId !== "string" ||
    !/^[a-f0-9]{24}$/i.test(orderId) ||
    typeof owner !== "string" ||
    !owner.trim()
  ) {
    throw new Error("Invalid diagnostic ownership identity.")
  }

  if (
    mongoose.connection.readyState !== 1 ||
    mongoose.connection.db?.databaseName !==
      "signavi_shipping_v3_dev" ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    !["development", "test"].includes(process.env.NODE_ENV)
  ) {
    throw new Error("Isolated Sandbox database required.")
  }

  const safe = sanitizeV3PersistedSquareDiagnostic(diagnostic)

  const result = await PaymentOperation.findOneAndUpdate(
    {
      orderId: new mongoose.Types.ObjectId(orderId),
      environment: "sandbox",
      status: "reconciliation_required",
      requestOwner: owner,
      squareCreationAttemptClaimedAt: { $type: "date" },
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: "",
      squareDiagnostic: null
    },
    {
      $set: {
        squareDiagnostic: safe
      }
    },
    {
      returnDocument: "after",
      runValidators: true
    }
  )

  if (!result) {
    throw new Error(
      "Diagnostic persistence rejected by ownership or state guard."
    )
  }

  return Object.freeze({
    saved: true,
    diagnostic: safe
  })
}