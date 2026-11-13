const OBJECT_ID = /^[0-9a-f]{24}$/;

const deny = (orderId, reason) => Object.freeze({
  orderId,
  inspectionAccepted: false,
  reason,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Read-only evidence boundary.
 *
 * Accepting an inspection is NOT authorization.
 * Missing Square history is NOT authoritative proof
 * that no earlier payment exists.
 *
 * No database access, Square requests, or writes.
 */
export function assessV3SandboxHistoryInspectionGate({
  orderId,
  inspection
} = {}) {
  const id = String(orderId ?? "").trim().toLowerCase();

  if (!OBJECT_ID.test(id)) {
    return deny(id, "INVALID_ORDER_ID");
  }

  if (
    !inspection ||
    typeof inspection !== "object" ||
    Array.isArray(inspection)
  ) {
    return deny(id, "HISTORY_INSPECTION_REQUIRED");
  }

  if (
    inspection.orderId !== id
  ) {
    return deny(id, "HISTORY_ORDER_MISMATCH");
  }

  if (
    inspection.initializationAuthorized !== false ||
    inspection.squareRequestAuthorized !== false ||
    inspection.retryAuthorized !== false ||
    inspection.authoritativeNoPriorActivity !== false
  ) {
    return deny(id, "HISTORY_AUTHORITY_CLAIM_REJECTED");
  }

  if (
    inspection.inspected !== true ||
    inspection.priorActivityFound !== false ||
    inspection.reason !==
      "NO_EXPLICIT_SQUARE_MATCH_OBSERVED_NOT_AUTHORIZED"
  ) {
    return deny(id, "HISTORY_INCOMPLETE_OR_UNCERTAIN");
  }

  return Object.freeze({
    orderId: id,
    inspectionAccepted: true,
    reason: "HISTORY_OBSERVATION_ACCEPTED_NOT_AUTHORIZED",
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}