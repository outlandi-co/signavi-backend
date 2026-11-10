import {
  inspectV3SandboxRecordedLink
} from "./inspectV3SandboxRecordedLink.js";

const enabled = () =>
  process.env.NODE_ENV === "test" &&
  process.env.SQUARE_ENVIRONMENT === "sandbox" &&
  process.env.SMART_SHIPPING_V3_CROSS_DATABASE_TEST_ENABLED === "true" &&
  process.env.SMART_SHIPPING_V3_HTTP_LINK_RELEASE_TEST_ENABLED === "true" &&
  process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED === "false";

const validId = id => /^[a-f0-9]{24}$/.test(id);

export function createV3TestOnlyLinkReleaseHandler({
  authenticateGuest,
  loadRecords,
  readSquareLink,
  readSquareOrder,
  expectedLocationId
} = {}) {
  if (
    typeof authenticateGuest !== "function" ||
    typeof loadRecords !== "function" ||
    typeof readSquareLink !== "function" ||
    typeof readSquareOrder !== "function" ||
    typeof expectedLocationId !== "string" ||
    !expectedLocationId.trim()
  ) {
    throw new Error("TRUSTED_LINK_RELEASE_DEPENDENCIES_REQUIRED");
  }

  return async function releaseRecordedLink(req, res) {
    const reject = (status, code) =>
      res.status(status).json({
        success: false,
        code,
        paymentUrl: null
      });

    if (!enabled()) {
      return reject(423, "V3_LINK_RELEASE_DISABLED");
    }

    const orderId = String(req.params?.orderId ?? "").toLowerCase();

    if (!validId(orderId)) {
      return reject(400, "INVALID_ORDER_ID");
    }

    let records;

    try {
      records = await loadRecords({ orderId });
    } catch {
      return reject(503, "PAYMENT_RECORDS_UNAVAILABLE");
    }

    const { order, operation, ownership } = records ?? {};

    if (String(order?._id ?? "").toLowerCase() !== orderId) {
      return reject(404, "ORDER_NOT_FOUND");
    }

    let authorized = false;

    try {
      authorized = await authenticateGuest({ req, order }) === true;
    } catch {
      return reject(403, "CHECKOUT_OWNERSHIP_REJECTED");
    }

    if (!authorized) {
      return reject(403, "CHECKOUT_OWNERSHIP_REJECTED");
    }

    const candidate = inspectV3SandboxRecordedLink({
      order,
      operation,
      ownership
    });

    if (!candidate.eligible) {
      return reject(409, "RECORDED_LINK_NOT_ELIGIBLE");
    }

    try {
      // These are trusted, read-only Square SDK adapters.
      // Never derive their credentials from req.
      const linkResponse = await readSquareLink({
        paymentLinkId: operation.squarePaymentLinkId
      });

      const orderResponse = await readSquareOrder({
        squareOrderId: operation.squareOrderId
      });

      const link = linkResponse?.paymentLink;
      const squareOrder = orderResponse?.order;

      const correctLink =
        link?.id === operation.squarePaymentLinkId &&
        link?.orderId === operation.squareOrderId &&
        link?.url === operation.paymentUrl;

      const correctSquareOrder =
        squareOrder?.id === operation.squareOrderId &&
        squareOrder?.referenceId === operation.checkoutReferenceId &&
        squareOrder?.locationId === expectedLocationId &&
        String(squareOrder?.totalMoney?.amount ?? "") ===
          String(operation.amountCents) &&
        String(squareOrder?.totalMoney?.currency ?? "").toUpperCase()
          === "USD";

      if (!correctLink || !correctSquareOrder) {
        return reject(409, "SQUARE_LINK_EVIDENCE_MISMATCH");
      }

      // Return only the already-persisted URL, never a value
      // supplied independently by the SDK or HTTP request.
      return res.status(200).json({
        success: true,
        code: "V3_TEST_ONLY_VERIFIED_LINK",
        paymentUrl: operation.paymentUrl,
        customerPaymentConfirmed: false
      });
    } catch {
      return reject(503, "SQUARE_LINK_EVIDENCE_UNAVAILABLE");
    }
  };
}