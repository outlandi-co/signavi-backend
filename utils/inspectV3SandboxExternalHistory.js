const VALID_ID = /^[0-9a-f]{24}$/;

const deny = (orderId, reason, details = {}) =>
  Object.freeze({
    orderId,
    inspected: false,
    reason,
    ...details,
    authoritativeNoPriorActivity: false,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });

export function assessV3SandboxExternalHistory({
  orderId,
  paymentEvidence,
  orderEvidence
} = {}) {
  const id = String(orderId ?? "").trim().toLowerCase();

  if (!VALID_ID.test(id)) {
    return deny(id, "INVALID_ORDER_ID");
  }

  for (const [name, evidence] of [
    ["PAYMENT", paymentEvidence],
    ["ORDER", orderEvidence]
  ]) {
    if (
      !evidence ||
      typeof evidence !== "object" ||
      evidence.environment !== "sandbox" ||
      evidence.orderId !== id ||
      evidence.complete !== true
    ) {
      return deny(
        id,
        `${name}_HISTORY_INCOMPLETE_OR_UNTRUSTED`
      );
    }

    if (evidence.priorActivityFound === true) {
      return deny(id, `${name}_HISTORY_PRIOR_ACTIVITY`, {
        priorActivityFound: true
      });
    }

    if (
      evidence.priorActivityFound !== false ||
      evidence.authoritativeNoPriorActivity !== false ||
      evidence.squareRequestAuthorized !== false ||
      evidence.retryAuthorized !== false
    ) {
      return deny(id, `${name}_HISTORY_UNSAFE_EVIDENCE`);
    }
  }

  return Object.freeze({
    orderId: id,
    inspected: true,
    reason: "NO_EXPLICIT_SQUARE_MATCH_OBSERVED_NOT_AUTHORIZED",
    priorActivityFound: false,
    authoritativeNoPriorActivity: false,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}

export async function inspectV3SandboxExternalHistory({
  orderId,
  testReaders
} = {}) {
  const id = String(orderId ?? "").trim().toLowerCase();

  if (
    !["test", "development"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox"
  ) {
    return deny(id, "SANDBOX_TEST_INSPECTION_ONLY");
  }

  if (!VALID_ID.test(id)) {
    return deny(id, "INVALID_ORDER_ID");
  }

  if (
    testReaders !== undefined &&
    process.env.NODE_ENV !== "test"
  ) {
    return deny(id, "TEST_READER_INJECTION_FORBIDDEN");
  }

  if (
    testReaders !== undefined &&
    (
      !testReaders ||
      typeof testReaders.readPayments !== "function" ||
      typeof testReaders.readOrders !== "function"
    )
  ) {
    return deny(id, "INVALID_TEST_READERS");
  }

  try {
    let readers = testReaders;

    if (!readers) {
      const [payments, orders] = await Promise.all([
        import("./createV3SandboxPaymentEvidenceReader.js"),
        import("./createV3SandboxOrderHistoryReader.js")
      ]);

      readers = {
        readPayments:
          payments.createV3SandboxPaymentEvidenceReader(),
        readOrders:
          orders.createV3SandboxOrderHistoryReader()
      };
    }

    const paymentEvidence =
      await readers.readPayments({ orderId: id });

    if (
      !paymentEvidence ||
      paymentEvidence.complete !== true ||
      paymentEvidence.priorActivityFound !== false
    ) {
      return assessV3SandboxExternalHistory({
        orderId: id,
        paymentEvidence,
        orderEvidence: null
      });
    }

    const orderEvidence =
      await readers.readOrders({ orderId: id });

    return assessV3SandboxExternalHistory({
      orderId: id,
      paymentEvidence,
      orderEvidence
    });
  } catch {
    return deny(id, "SQUARE_HISTORY_INSPECTION_FAILED");
  }
}