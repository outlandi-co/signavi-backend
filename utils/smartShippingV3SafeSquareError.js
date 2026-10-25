import { SquareError, SquareTimeoutError } from "square"

// Pure diagnostic classification.
// Never serialize raw errors, response bodies,
// access tokens, URLs or transport headers.

const allowedCodes = new Set([
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

const allowedCategories = new Set([
  "API_ERROR",
  "AUTHENTICATION_ERROR",
  "INVALID_REQUEST_ERROR",
  "RATE_LIMIT_ERROR",
  "PAYMENT_METHOD_ERROR",
  "REFUND_ERROR"
])

const emptyDiagnostic = (type, statusCode = null) =>
  Object.freeze({
    type,
    statusCode,
    category: null,
    code: null,
    outcomeKnown: false
  })

export const classifyV3SafeSquareError = error => {
  if (error instanceof SquareTimeoutError) {
    return emptyDiagnostic("timeout")
  }

  if (!(error instanceof SquareError)) {
    return emptyDiagnostic("unknown_exception")
  }

  const statusCode =
    Number.isInteger(error.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode <= 599
      ? error.statusCode
      : null

  const errors = Array.isArray(error.errors)
    ? error.errors.slice(0, 10)
    : []

  const allowedFields = new Set([
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

  const recognized = errors.find(item =>
    item &&
    allowedCategories.has(item.category) &&
    allowedCodes.has(item.code)
  )

  const categorized = recognized || errors.find(item =>
    item && allowedCategories.has(item.category)
  )

  return Object.freeze({
    type: "square_api_error",
    statusCode,
    category: categorized?.category ?? null,
    code: recognized?.code ?? null,
    field:
      recognized && allowedFields.has(recognized.field)
        ? recognized.field
        : null,
    outcomeKnown: false
  })
}
