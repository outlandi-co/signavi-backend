import {
  inspectV3SandboxExternalHistory
} from "./inspectV3SandboxExternalHistory.js";

import {
  assessV3SandboxHistoryInspectionGate
} from "./assessV3SandboxHistoryInspectionGate.js";

const OBJECT_ID = /^[0-9a-f]{24}$/;

const blocked = (orderId, reason) => Object.freeze({
  orderId,
  ready: false,
  reason,
  inspectionAccepted: false,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Server-owned, read-only Square history preflight.
 *
 * No caller-provided history objects or reader callbacks.
 * No database writes or payment requests.
 *
 * An accepted observation is NOT payment authorization.
 */
export async function coordinateV3SandboxTrustedHistoryPreflight({
  orderId
} = {}) {
  const id = String(orderId ?? "").trim().toLowerCase();

  if (!OBJECT_ID.test(id)) {
    return blocked(id, "INVALID_ORDER_ID");
  }

  if (
    !["development", "test"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox"
  ) {
    return blocked(id, "SANDBOX_HISTORY_PREFLIGHT_DISABLED");
  }

  let inspection;

  try {
    inspection = await inspectV3SandboxExternalHistory({
      orderId: id
    });
  } catch {
    return blocked(id, "SANDBOX_HISTORY_PREFLIGHT_FAILED");
  }

  const assessed = assessV3SandboxHistoryInspectionGate({
    orderId: id,
    inspection
  });

  if (assessed.inspectionAccepted !== true) {
    return blocked(
      id,
      assessed.reason || "SANDBOX_HISTORY_NOT_ACCEPTED"
    );
  }

  return Object.freeze({
    orderId: id,
    ready: false,
    reason: "TRUSTED_HISTORY_AUTHORITY_NOT_CONNECTED",
    inspectionAccepted: true,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}