import {
  collectV3FirstPaymentStrictReview
} from "./collectV3FirstPaymentStrictReview.js";

const readerNames = Object.freeze([
  "readKnownHistory",
  "readPaymentLinks",
  "readSquareOrders",
  "readSquarePayments",
  "readOwnership"
]);

const blocked = (reason) => Object.freeze({
  assessed: false,
  readyForAuthorizationReview: false,
  reason,
  source: null,
  authoritativeNoPriorActivity: false,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Configure once inside trusted server code.
 *
 * This factory does not authenticate dependency provenance.
 * Do not expose it as an HTTP handler or accept configuration
 * derived from browser requests.
 *
 * The resulting review() function accepts only an order ID.
 * No payment execution or database writes occur here.
 */
export function createV3ServerBoundFirstPaymentReview(
  configuredReaders
) {
  if (
    configuredReaders === null ||
    typeof configuredReaders !== "object" ||
    Array.isArray(configuredReaders)
  ) {
    throw new TypeError("V3_READER_CONFIGURATION_INVALID");
  }

  const boundReaders = {};

  for (const name of readerNames) {
    if (
      !Object.hasOwn(configuredReaders, name) ||
      typeof configuredReaders[name] !== "function"
    ) {
      throw new TypeError("V3_READER_CONFIGURATION_INCOMPLETE");
    }

    // Capture functions at configuration time.
    boundReaders[name] = configuredReaders[name];
  }

  Object.freeze(boundReaders);

  return Object.freeze({
    async review(orderId) {
      if (
        typeof orderId !== "string" ||
        !/^[0-9a-f]{24}$/.test(orderId)
      ) {
        return blocked("INVALID_ORDER_ID");
      }

      try {
        return await collectV3FirstPaymentStrictReview({
          orderId,
          environment: "sandbox",
          ...boundReaders
        });
      } catch {
        return blocked("SERVER_BOUND_REVIEW_FAILED");
      }
    }
  });
}
