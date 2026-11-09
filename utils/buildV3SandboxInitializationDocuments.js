import { BSON } from "mongodb";

const cloneBsonDocument = value =>
  BSON.deserialize(BSON.serialize(value));
import {
  assessV3SandboxInitialization
} from "./assessV3SandboxInitialization.js";

/**
 * Constructs candidate isolated Sandbox documents.
 *
 * Pure preparation only:
 * - No database connection or writes
 * - No Square requests
 * - No authorization for initialization or payment
 *
 * A separate trusted coordinator must verify external
 * payment history and invoice evidence before persistence.
 */
export function buildV3SandboxInitializationDocuments({
  storefrontOrder,
  storefrontOperation,
  sandboxOrder = null,
  sandboxOperation = null
} = {}) {
  const assessment = assessV3SandboxInitialization({
    storefrontOrder,
    storefrontOperation,
    sandboxOrder,
    sandboxOperation
  });

  if (assessment.eligible !== true) {
    return Object.freeze({
      eligible: false,
      reason: assessment.reason,
      initializationAuthorized: false,
      squareRequestAuthorized: false,
      retryAuthorized: false
    });
  }

  const order = cloneBsonDocument(
    storefrontOrder?.toObject
      ? storefrontOrder.toObject()
      : storefrontOrder
  );

  const operation = cloneBsonDocument(
    storefrontOperation?.toObject
      ? storefrontOperation.toObject()
      : storefrontOperation
  );

  if (
    !order ||
    !operation ||
    !order.customerName ||
    !order.email ||
    !Array.isArray(order.items) ||
    order.items.length === 0 ||
    String(order._id).toLowerCase() !== assessment.orderId ||
    String(operation.orderId).toLowerCase() !== assessment.orderId ||
    operation.amountCents !== assessment.amountCents ||
    operation.checkoutReferenceId !== assessment.checkoutReferenceId
  ) {
    return Object.freeze({
      eligible: false,
      reason: "SANDBOX_DOCUMENT_BINDING_INVALID",
      initializationAuthorized: false,
      squareRequestAuthorized: false,
      retryAuthorized: false
    });
  }

  return Object.freeze({
    eligible: true,
    reason: "SANDBOX_DOCUMENTS_PREPARED_ONLY",
    orderId: assessment.orderId,
    amountCents: assessment.amountCents,
    orderDocument: order,
    operationDocument: operation,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}