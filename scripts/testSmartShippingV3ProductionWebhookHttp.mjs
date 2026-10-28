import assert from "node:assert/strict"
import crypto from "node:crypto"
import express from "express"
import vm from "node:vm"
import { readFileSync } from "node:fs"

import {
  parseV3WebhookOrderReference
} from "../utils/smartShippingV3WebhookReference.js"

import {
  verifyV3ProductionWebhookPaymentBinding
} from "../utils/smartShippingV3ProductionWebhookPaymentBinding.js"

import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

const routeSource = readFileSync(
  new URL("../routes/squareWebhook.js", import.meta.url),
  "utf8"
)

// Execute the actual route implementation, without its imports.
// Every external dependency is supplied by this synthetic harness.
const start = routeSource.indexOf("const router = express.Router()")
const end = routeSource.lastIndexOf("export default router")

assert.ok(start >= 0 && end > start, "Route boundaries missing")

const routeBody = routeSource.slice(start, end)

const orderId = "507f191e810c19729de860ea"
const reference = createV3SquareSafeCheckoutReference({
  orderId
})

const signatureKey = "synthetic-test-signature-key"
const notificationUrl = "https://synthetic.invalid/webhook"
const locationId = "synthetic-location"

const makeOrder = () => ({
  _id: orderId,
  status: "payment_required",
  paymentStatus: "unpaid",
  squareEnvironment: "production",
  squareExpectedAmountCents: 100,
  currency: "USD",
  squareOrderId: "",
  squarePaymentId: "",
  squarePaymentLinkId: "",
  paymentUrl: "",
  timeline: []
})

const operation = {
  orderId,
  environment: "production",
  status: "completed",
  requestOwner: "synthetic-owner",
  idempotencyKey: "signavi-v3-production-synthetic",
  checkoutReferenceId: reference,
  amountCents: 100,
  squarePaymentLinkId: "synthetic-link",
  squareOrderId: "synthetic-square-order",
  paymentUrl: "https://square.link/u/synthetic"
}

const payment = {
  id: "synthetic-payment",
  status: "COMPLETED",
  order_id: "synthetic-square-order",
  location_id: locationId,
  amount_money: {
    amount: 100,
    currency: "USD"
  }
}

const squareOrder = {
  id: "synthetic-square-order",
  reference_id: reference,
  location_id: locationId,
  total_money: {
    amount: 100,
    currency: "USD"
  }
}

const setup = ({
  initialOrder = makeOrder(),
  paymentOverride = {},
  squareOrderOverride = {},
  operationOverride = {},
  invoiceMatches = [], beforeAtomicUpdate = null
} = {}) => {
  let handler
  let paidUpdates = 0
  let squareLookups = 0
  let invoiceUpdates = 0

  const local = structuredClone(initialOrder)
  const verifiedPayment = {
    ...structuredClone(payment),
    ...paymentOverride
  }
  const verifiedOrder = {
    ...structuredClone(squareOrder),
    ...squareOrderOverride
  }

  const Order = {
    findOne: async query => {
      return query.squareOrderId === local.squareOrderId &&
        !!local.squareOrderId
        ? local
        : null
    },
    findById: async id =>
      String(id) === String(local._id) ? local : null,
    findOneAndUpdate: async (query, mutation) => {
      // Assert that the real route passes an atomic paid-state filter.
      assert.ok(
        query.paymentStatus?.$nin?.includes("paid"),
        "Atomic filter must exclude paid orders"
      )
      assert.ok(
        query.paymentStatus?.$nin?.includes("refunded"),
        "Atomic filter must exclude refunded orders"
      )
      assert.ok(
        query.status?.$nin?.includes("cancelled"),
        "Atomic filter must exclude closed orders"
      )
      assert.ok(
        query.squarePaymentId?.$in?.includes(verifiedPayment.id),
        "Atomic filter must bind the payment identity"
      )
      assert.equal(
        query.squareEnvironment,
        "production",
        "Atomic filter must bind Production environment"
      )

      // Simulate another delivery committing just before this update.
      if (beforeAtomicUpdate) {
        beforeAtomicUpdate(local)
      }

      // This mock deliberately checks the critical compare-and-set
      // conditions instead of blindly accepting every update.
      if (
        String(query._id) !== String(local._id) ||
        local.paymentStatus === "paid" ||
        local.paymentStatus === "refunded" ||
        local.squareEnvironment !== query.squareEnvironment ||
        (local.squarePaymentId &&
          local.squarePaymentId !== verifiedPayment.id) ||
        (local.squareOrderId &&
          local.squareOrderId !== verifiedOrder.id)
      ) {
        return null
      }

      paidUpdates++
      Object.assign(local, mutation.$set)
      if (mutation.$push?.timeline) {
        local.timeline.push(mutation.$push.timeline)
      }
      return local
    },
    updateOne: async () => {
      throw new Error("Unexpected receipt update")
    }
  }

  const Invoice = {
    find: () => ({
      limit: async () => invoiceMatches
    }),
    findOneAndUpdate: async () => {
      invoiceUpdates++
      throw new Error("Invoice update requires separate fixture")
    },
    findById: async () => null
  }

  const PaymentOperation = {
    findOne: () => ({
      lean: async () => ({
        ...structuredClone(operation),
        ...operationOverride
      })
    })
  }

  const mockedFetch = async url => {
    squareLookups++
    if (url.endsWith("/v2/payments/synthetic-payment")) {
      return {
        ok: true,
        json: async () => ({ payment: verifiedPayment })
      }
    }
    if (url.endsWith("/v2/orders/synthetic-square-order")) {
      return {
        ok: true,
        json: async () => ({ order: verifiedOrder })
      }
    }
    throw new Error("Unexpected external endpoint: " + url)
  }

  const router = {
    post: (path, callback) => {
      assert.equal(path, "/webhook")
      handler = callback
    }
  }

  const context = {
    express: { Router: () => router },
    crypto,
    fetch: mockedFetch,
    Order,
    Quote: {
      findById: () => ({
        select: async () => null
      })
    },
    Invoice,
    Notification: {
      create: async () => {
        throw new Error("Notifications disabled in test")
      }
    },
    SmartShippingV3PaymentOperation: PaymentOperation,
    sendReceiptEmail: async () => {
      throw new Error("Receipts disabled in test")
    },
    parseV3WebhookOrderReference,
    verifyV3ProductionWebhookPaymentBinding,
    process: {
      env: {
        SQUARE_ENVIRONMENT: "production",
        SQUARE_WEBHOOK_SIGNATURE_KEY: signatureKey,
        SQUARE_WEBHOOK_URL: notificationUrl,
        SQUARE_ACCESS_TOKEN: "synthetic-test-token",
        SQUARE_LOCATION_ID: locationId
      }
    },
    Buffer,
    AbortSignal,
    Date,
    console: {
      log() {},
      warn() {},
      error() {}
    }
  }

  vm.runInNewContext(routeBody, context, {
    filename: "squareWebhook-isolated-test.js",
    timeout: 2000
  })

  assert.equal(typeof handler, "function")

  const deliver = async ({
    validSignature = true,
    eventType = "payment.updated"
  } = {}) => {
    const event = {
      type: eventType,
      data: {
        object: {
          payment: {
            id: "synthetic-payment",
            status: "COMPLETED"
          }
        }
      }
    }

    const body = Buffer.from(JSON.stringify(event))

    const signature = crypto
      .createHmac("sha256", signatureKey)
      .update(notificationUrl, "utf8")
      .update(body)
      .digest("base64")

    let statusCode = null

    const req = {
      body,
      headers: {
        "x-square-hmacsha256-signature":
          validSignature ? signature : "invalid-signature"
      },
      app: { get: () => null }
    }

    const res = {
      sendStatus: code => {
        statusCode = code
        return res
      }
    }

    await handler(req, res)

    assert.ok(statusCode !== null, "No response status")

    return statusCode
  }

  return {
    deliver,
    local,
    get handler() { return handler },
    get paidUpdates() { return paidUpdates },
    get squareLookups() { return squareLookups },
    get invoiceUpdates() { return invoiceUpdates }
  }
}



// Production V3 verification-only tests.

const run = async (name, options = {}, expectedStatus = 200) => {
  const test = setup(options);

  const response = await test.deliver({
    validSignature: expectedStatus !== 401
  });

  assert.equal(response, expectedStatus);
  assert.equal(test.paidUpdates, 0);
  assert.equal(test.invoiceUpdates, 0);

  assert.equal(
    test.local.paymentStatus,
    options?.initialOrder?.paymentStatus || "unpaid"
  );

  console.log("PASS:", name);
};

await run("Signed production V3 payment: no write");

await run(
  "Invalid signature rejected before Square",
  {},
  401
);

await run("Wrong production payment amount: no write", {
  paymentOverride: {
    amount_money: {
      amount: 200,
      currency: "USD"
    }
  },
  squareOrderOverride: {
    total_money: {
      amount: 200,
      currency: "USD"
    }
  }
});

await run("Conflicting Square operation: no write", {
  operationOverride: {
    squareOrderId: "incorrect-square-order"
  }
});

await run("Wrong V3 checkout reference: no write", {
  squareOrderOverride: {
    reference_id: createV3SquareSafeCheckoutReference({
      orderId: "507f191e810c19729de860eb"
    })
  }
});

await run("Wrong Square location: no write", {
  paymentOverride: {
    location_id: "incorrect-location"
  }
});

await run("Legacy invoice collision: no write", {
  invoiceMatches: [{
    _id: "synthetic-invoice"
  }]
});

// Actual local HTTP transport using synthetic credentials.

const test = setup();
const app = express();

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  test.handler
);

const server = await new Promise((resolve, reject) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
  s.once("error", reject);
});

try {
  const address = server.address();

  assert.ok(address && typeof address !== "string");

  const url = `http://127.0.0.1:${address.port}/webhook`;

  const deliverHttp = async validSignature => {
    const body = JSON.stringify({
      type: "payment.updated",
      data: {
        object: {
          payment: {
            id: "synthetic-payment",
            status: "COMPLETED"
          }
        }
      }
    });

    const signature = crypto
      .createHmac("sha256", signatureKey)
      .update(notificationUrl, "utf8")
      .update(Buffer.from(body))
      .digest("base64");

    const response = await globalThis.fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-square-hmacsha256-signature":
          validSignature ? signature : "invalid-signature"
      },
      body,
      signal: AbortSignal.timeout(5000)
    });

    return response.status;
  };

  assert.equal(await deliverHttp(false), 401);
  assert.equal(test.squareLookups, 0);
  assert.equal(test.paidUpdates, 0);

  console.log("PASS: HTTP invalid signature rejected");

  assert.equal(await deliverHttp(true), 200);
  assert.equal(test.paidUpdates, 0);
  assert.equal(test.local.paymentStatus, "unpaid");

  console.log("PASS: HTTP signed production payment: no write");

  assert.equal(await deliverHttp(true), 200);
  assert.equal(test.paidUpdates, 0);
  assert.equal(test.local.timeline.length, 0);

  console.log("PASS: HTTP duplicate delivery: no write");

  console.log("");
  console.log("PRODUCTION HTTP WEBHOOK TESTS: PASSED");
  console.log("SQUARE API: MOCKED");
  console.log("DATABASE: MOCKED");
  console.log("NO REAL SQUARE REQUESTS");
  console.log("NO PAYMENT STATUS WRITES");

} finally {
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}
