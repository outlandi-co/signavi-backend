import mongoose from "mongoose";

import Reservation from
  "../models/SmartShippingV3ProductionPurchaseReservation.js";

import PaymentOperation from
  "../models/SmartShippingV3PaymentOperation.js";

import SquareReservation from
  "../models/SquarePaymentCreationReservation.js";

import SharedPaymentReservation from
  "../models/SharedSquarePaymentReservation.js";

import {
  checkV3KnownPaymentHistory
} from "./checkV3KnownPaymentHistory.js";

import {
  acquireV3SharedCheckoutFence
} from "./acquireV3SharedCheckoutFence.js";

import {
  createV3ProductionCheckoutActivationCoordinator
} from "./coordinateV3ProductionCheckoutActivation.js";

const blocked = reason => Object.freeze({
  ready: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false,
  httpStatus: 423
});

/**
 * Server-owned production checkout activation binding.
 *
 * IMPORTANT:
 * Known MongoDB history is not exhaustive Square history.
 * This factory deliberately fails closed until an independently
 * verified external-history authorization path exists.
 *
 * No Square client, link creation, or HTTP activation occurs here.
 */
export function createV3ProductionCheckoutActivation({
  Order
} = {}) {
  if (
    typeof Order?.findById !== "function" ||
    typeof Order?.findOne !== "function" ||
    typeof SquareReservation?.findOne !== "function" ||
    typeof SharedPaymentReservation?.findOne !== "function"
  ) {
    return async () => blocked("TRUSTED_REPOSITORIES_REQUIRED");
  }

  return async function activate({
    order,
    guestToken,
    signedQuote
  } = {}) {
    if (
      process.env.SQUARE_ENVIRONMENT !== "production" ||
      mongoose.connection.readyState !== 1
    ) {
      return blocked("PRODUCTION_ENVIRONMENT_NOT_READY");
    }

    const coordinator =
      createV3ProductionCheckoutActivationCoordinator({
        Order,
        Reservation,
        PaymentOperation,
        startSession: () => mongoose.startSession(),

        checkHistoricalPayment: async ({ orderId }) =>
          checkV3KnownPaymentHistory({
            orderId,
            Order,
            SquareReservation,
            SharedPaymentReservation,
            ProductionReservation: Reservation,
            PaymentOperation
          }),

        acquireSharedFence: acquireV3SharedCheckoutFence
      });

    return coordinator({
      order,
      guestToken,
      signedQuote
    });
  };
}