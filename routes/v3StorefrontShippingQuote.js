import express from "express"

import {
  authorizeV3StorefrontShippingQuote
} from "../utils/authorizeV3StorefrontShippingQuote.js"

import {
  createV3StorefrontOrderShippingOptions
} from "../utils/createV3StorefrontOrderShippingOptions.js"

const validOrderId = (id) =>
  typeof id === "string" &&
  /^[a-f0-9]{24}$/i.test(id)

export const createV3StorefrontShippingQuoteRouter = ({
  findOrder,
  getTrustedShipments
}) => {
  if (
    typeof findOrder !== "function" ||
    typeof getTrustedShipments !== "function"
  ) {
    throw new Error("V3 shipping dependencies are required.")
  }

  const router = express.Router()

  router.post("/:id/quote", async (req, res) => {
    try {
      const orderId = req.params.id

      if (!validOrderId(orderId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID."
        })
      }

      const guestToken = req.get(
        "x-signavi-guest-checkout-token"
      )

      if (!guestToken) {
        return res.status(403).json({
          success: false,
          message: "Checkout authorization required."
        })
      }

      const order = await findOrder(orderId)

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found."
        })
      }

      const authorization = authorizeV3StorefrontShippingQuote({
        order,
        guestToken
      })

      if (!authorization) {
        return res.status(403).json({
          success: false,
          message: "Shipping quote not authorized."
        })
      }

      // The injected provider must use saved order items,
      // trusted product measurements and server credentials.
      // Never pass browser-provided parcel or rate data.
      const trustedShipments = await getTrustedShipments(order)

      // Re-read the saved order after carrier I/O.
      // A changed or no-longer-eligible order must never
      // receive a quote signed against stale details.
      const currentOrder = await findOrder(orderId)

      const currentAuthorization = currentOrder
        ? authorizeV3StorefrontShippingQuote({
            order: currentOrder,
            guestToken
          })
        : null

      if (
        !currentAuthorization ||
        currentAuthorization.orderId !== authorization.orderId ||
        currentAuthorization.fingerprint !== authorization.fingerprint
      ) {
        return res.status(409).json({
          success: false,
          message: "Order changed. Please refresh shipping rates."
        })
      }

      const result = createV3StorefrontOrderShippingOptions({
        order: currentOrder,
        guestToken,
        trustedShipments
      })

      if (!result) {
        return res.status(422).json({
          success: false,
          message: "No valid V3 shipping options available."
        })
      }

      return res.status(200).json({
        success: true,
        orderId: result.orderId,
        parcelCount: result.parcelCount,
        shippingOptions: result.shippingOptions
      })
    } catch (error) {
      console.error(
        "V3 SHIPPING QUOTE ERROR:",
        error?.message || "Unknown error"
      )

      const carrierRatesUnavailable =
        error?.message === "Incomplete carrier shipment rates."

      return res.status(
        carrierRatesUnavailable ? 503 : 502
      ).json({
        success: false,
        message: carrierRatesUnavailable
          ? "Shipping rates are temporarily unavailable for this address. Please verify the shipping address and try again."
          : "Shipping quote unavailable.",
        ...(carrierRatesUnavailable
          ? { code: "SHIPPING_RATES_UNAVAILABLE" }
          : {})
      })
    }
  })

  return router
}