import mongoose from "mongoose";
import { verifyV3WebhookPaymentBinding } from "./smartShippingV3WebhookPaymentBinding.js";

export async function reconcileV3SandboxPaymentIsolated({
  connection,
  Order,
  PaymentOperation,
  payment,
  squareOrder,
  expectedLocationId
}) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    connection?.db?.databaseName !== "signavi_shipping_v3_dev"
  ) {
    throw new Error("SANDBOX_RECONCILIATION_FORBIDDEN");
  }

  if (
    !connection ||
    !Order ||
    !PaymentOperation ||
    !payment?.id ||
    !payment?.order_id ||
    payment.status !== "COMPLETED" ||
    !squareOrder?.id ||
    !expectedLocationId
  ) {
    throw new Error("INVALID_VERIFIED_PAYMENT_EVIDENCE");
  }

  // The caller must retrieve payment and order directly from
  // Square's sandbox API. Webhook payloads are not sufficient.

  const session = await connection.startSession();

  try {
    let outcome;

    await session.withTransaction(async () => {
      const operations = await PaymentOperation.find({
        environment: "sandbox",
        status: "completed",
        squareOrderId: squareOrder.id
      }).session(session).limit(2).lean();

      if (operations.length !== 1) {
        throw new Error("AMBIGUOUS_SANDBOX_OPERATION");
      }

      const operation = operations[0];

      const order = await Order.findById(
        operation.orderId
      ).session(session).lean();

      if (!order) {
        throw new Error("SANDBOX_ORDER_NOT_FOUND");
      }

      const binding = verifyV3WebhookPaymentBinding({
        order,
        operation,
        payment,
        squareOrder,
        expectedLocationId
      });

      if (binding.bindingVerified !== true) {
        throw new Error("SANDBOX_PAYMENT_BINDING_REJECTED");
      }

      if (binding.exactPaidReplay === true) {
        outcome = "ALREADY_RECONCILED";
        return;
      }

      // The unique _id prevents a second transaction from
      // claiming the same sandbox payment identity.
      const claimCollection = connection.db.collection(
        "v3_sandbox_payment_claims"
      );

      const claims = [
        {
          _id: `sandbox:payment:${payment.id}`,
          claimType: "payment",
          paymentId: payment.id,
          orderId: String(order._id),
          squareOrderId: squareOrder.id,
          amountCents: binding.amountCents,
          createdAt: new Date()
        },
        {
          _id: `sandbox:order:${String(order._id)}`,
          claimType: "order",
          paymentId: payment.id,
          orderId: String(order._id),
          squareOrderId: squareOrder.id,
          amountCents: binding.amountCents,
          createdAt: new Date()
        }
      ];

      await claimCollection.insertMany(
        claims,
        { session, ordered: true }
      );

      const result = await Order.updateOne({
        _id: order._id,
        squareEnvironment: "sandbox",
        status: "payment_required",
        paymentStatus: "unpaid",
        squareExpectedAmountCents: binding.amountCents,
        squarePaymentId: { $in: [null, ""] },
        squareOrderId: {
          $in: [null, "", squareOrder.id]
        }
      }, {
        $set: {
          status: "paid",
          paymentStatus: "paid",
          paymentMethod: "Square",
          squarePaymentId: payment.id,
          squareOrderId: squareOrder.id,
          squarePaymentLinkId: operation.squarePaymentLinkId,
          paidAt: new Date()
        }
      }, { session });

      if (result.modifiedCount !== 1) {
        throw new Error("SANDBOX_ORDER_STATE_CHANGED");
      }

      outcome = "RECONCILED";
    });

    return Object.freeze({
      outcome,
      paymentCreationAuthorized: false
    });
  } finally {
    await session.endSession();
  }
}
