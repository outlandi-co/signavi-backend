import { SquareError, SquareTimeoutError } from "square"

// Pure diagnostic classification.
// Never serialize raw errors, response bodies,
// access tokens, URLs or transport headers.

const allowedCodes = new Set([
  "INVALID_VALUE",
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

export const classifyV3SafeSquareError = error => {
  if (error instanceof SquareTimeoutError) {
    return Object.freeze({
      type: "timeout",
      statusCode: null,
      category: null,
      code: null,
      outcomeKnown: false
    })
  }

  if (error instanceof SquareError) {
    const first = error.errors?.[0]

    const category = allowedCategories.has(first?.category)
      ? first.category
      : null

    const statusCode =
      Number.isInteger(error.statusCode) &&
      error.statusCode >= 400 &&
      error.statusCode <= 599
        ? error.statusCode
        : null

    return Object.freeze({
      type: "square_api_error",
      statusCode,
      category,
      code: allowedCodes.has(first?.code) ? first.code : null,
      outcomeKnown: false
    })
  }

  return Object.freeze({
    type: "unknown_exception",
    statusCode: null,
    category: null,
    code: null,
    outcomeKnown: false
  })
}