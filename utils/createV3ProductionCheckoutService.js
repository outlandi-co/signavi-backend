
import mongoose from "mongoose"

import Reservation from "../models/SharedSquarePaymentReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  createV3ProductionCheckoutClient
} from "./createV3ProductionCheckoutClient.js"

import {
  createV3TrustedCheckoutService
} from "./createV3TrustedCheckoutService.js"

/**
 * Production-only, server-owned checkout service binding.
 *
 * This factory does not create a Square payment link.
 * It provides trusted repositories and Square configuration
 * to the existing payment executor.
 */
export function createV3ProductionCheckoutService() {
  if (
    String(process.env.SQUARE_ENVIRONMENT || "")
      .trim()
      .toLowerCase() !== "production"
  ) {
    throw new Error("PRODUCTION_CHECKOUT_ENVIRONMENT_REQUIRED")
  }

  if (mongoose.connection.readyState !== 1) {
    throw new Error("PRODUCTION_DATABASE_CONNECTION_REQUIRED")
  }

  const { checkoutClient, locationId } =
    createV3ProductionCheckoutClient()

  return createV3TrustedCheckoutService({
    Reservation,
    PaymentOperation,
    startSession: () => mongoose.startSession(),
    checkoutClient,
    locationId
  })
}
