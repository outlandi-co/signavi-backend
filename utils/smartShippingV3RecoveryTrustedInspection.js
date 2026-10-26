import {
  createV3RecoveryTrustedRecordLoader
} from "./smartShippingV3RecoveryTrustedRecordLoader.js"

import {
  createV3RecoverySandboxReader
} from "./smartShippingV3RecoverySandboxReader.js"

import {
  inspectV3RecoveryReadOnly
} from "./smartShippingV3RecoveryReadOnlyCoordinator.js"

const TEST_DB = "signavi_shipping_v3_recovery_tests"

export const createV3RecoveryTrustedInspection = ({
  connection,
  OrderModel,
  PaymentOperationModel,
  Client
} = {}) => {
  const assertBoundary = () => {
    if (
      process.env.NODE_ENV !== "test" ||
      process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
      process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED === "true" ||
      connection?.readyState !== 1 ||
      connection?.name !== TEST_DB ||
      connection?.db?.databaseName !== TEST_DB ||
      typeof Client !== "function"
    ) {
      throw new Error(
        "V3 trusted recovery inspection boundary rejected."
      )
    }
  }

  assertBoundary()

  const token = process.env.SQUARE_SANDBOX_ACCESS_TOKEN
  const merchantId = process.env.SQUARE_SANDBOX_MERCHANT_ID
  const locationId = process.env.SQUARE_SANDBOX_LOCATION_ID

  if (
    !token?.trim() ||
    !merchantId?.trim() ||
    !locationId?.trim()
  ) {
    throw new Error("V3 trusted Sandbox configuration missing.")
  }

  const loadTrustedRecords = createV3RecoveryTrustedRecordLoader({
    connection,
    OrderModel,
    PaymentOperationModel
  })

  const reader = createV3RecoverySandboxReader({
    token,
    expectedMerchantId: merchantId,
    expectedLocationId: locationId,
    Client
  })

  return Object.freeze({
    inspect: async ({ orderId, expectedPaymentLinkId } = {}) => {
      assertBoundary()

      // Fail closed if credentials or trusted identity changed.
      if (
        process.env.SQUARE_SANDBOX_ACCESS_TOKEN !== token ||
        process.env.SQUARE_SANDBOX_MERCHANT_ID !== merchantId ||
        process.env.SQUARE_SANDBOX_LOCATION_ID !== locationId
      ) {
        throw new Error(
          "V3 trusted Sandbox configuration changed."
        )
      }

      return inspectV3RecoveryReadOnly({
        orderId,
        expectedPaymentLinkId,
        loadTrustedRecords,
        verifyTrustedIdentity: reader.verifyIdentity,
        lookupClient: reader.lookupClient,
        expectedMerchantId: merchantId,
        expectedLocationId: locationId
      })
    }
  })
}