import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"
process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex")
process.env.SHIPPING_V3_QUOTE_SECRET =
  crypto.randomBytes(48).toString("hex")
delete process.env.MONGO_URI

const replica = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" }
});

try {
  await mongoose.connect(replica.getUri("signavi_store"));

  const store = mongoose.connection;
  const sandbox = store.useDb("signavi_shipping_v3_dev", {
    useCache: true
  });

  const { default: Order } = await import("../models/Order.js");
  const { createGuestCheckoutToken } =
    await import("../utils/guestCheckoutToken.js");
  const { createV3OrderFingerprint } =
    await import("../utils/smartShippingV3OrderFingerprint.js");
  const { createV3SignedQuote } =
    await import("../utils/smartShippingV3QuoteSigning.js");
  const { createV3CrossDatabaseCheckoutModels } =
    await import("../utils/createV3CrossDatabaseCheckoutModels.js");
  const { prepareV3AtomicSandboxCheckout: prepare } =
    await import("../utils/prepareV3AtomicSandboxCheckout.js");

  process.env.NODE_ENV = "test";
  process.env.SQUARE_ENVIRONMENT = "sandbox";
  process.env.SMART_SHIPPING_V3_ENABLED = "true";
  process.env.SMART_SHIPPING_V3_SANDBOX_PREPARE_ENABLED = "true";
  process.env.SMART_SHIPPING_V3_DURABLE_PREPARE_ENABLED = "true";
  process.env.SMART_SHIPPING_V3_CROSS_DATABASE_TEST_ENABLED = "true";

  const models = createV3CrossDatabaseCheckoutModels({
    storefrontConnection: store,
    sandboxConnection: sandbox
  });

  const Lock = sandbox.model(
    "V3AcceptanceCheckoutLock",
    new mongoose.Schema({
      _id: mongoose.Schema.Types.ObjectId,
      owner: String,
      expiresAt: Date
    }, {
      collection: "smart_shipping_v3_checkout_locks"
    })
  );

  // Ensure unique ownership/operation indexes in the test replica.
  await models.SandboxOwnership.createIndexes();
  await models.SandboxPaymentOperation.createIndexes();

  const fixture = async () => {
    const orderId = new mongoose.Types.ObjectId();

    await new Order({
      _id: orderId,
      source: "store",
      status: "payment_required",
      paymentStatus: "unpaid",
      customerName: "Cross Database Test",
      email: "customer@example.com",
      address: {
        street: "123 Test Street",
        city: "Test City",
        state: "CA",
        zip: "90001",
        country: "US"
      },
      subtotal: 39.98,
      tax: 3.30,
      items: [{
        productId: new mongoose.Types.ObjectId(),
        quantity: 2,
        finalPrice: 19.99,
        variant: { color: "black", size: "L" }
      }]
    }).save();

    const order = await Order.findById(orderId);

    const guestToken = createGuestCheckoutToken(order);

    const signedQuote = createV3SignedQuote({
      cartFingerprint: createV3OrderFingerprint(order),
      shippingAmountCents: 1200,
      parcelRateIds: ["test_rate_1", "test_rate_2"],
      carrier: "USPS",
      serviceToken: "usps_ground_advantage"
    });

    const owner = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60000);

    await Lock.create({
      _id: orderId,
      owner,
      expiresAt
    });

    return {
      orderId,
      lock: {
        orderId: String(orderId),
        owner,
        expiresAt
      },
      guestToken,
      signedQuote
    };
  };

  const execute = (item, extra = {}) => prepare({
    lock: item.lock,
    guestToken: item.guestToken,
    signedQuote: item.signedQuote,
    storefrontConnection: store,
    sandboxConnection: sandbox,
    ...extra
  });

  // 1. Successful transaction.
  const success = await fixture();
  const result = await execute(success);

  assert.equal(result.success, true);
  assert.equal(result.paymentCreated, false);
  assert.equal(result.squareRequestAuthorized, false);

  const savedOrder = await Order.findById(success.orderId).lean();

  assert.equal(savedOrder.squareExpectedAmountCents, 5528);

  assert.equal(
    await models.SandboxPaymentOperation.countDocuments({
      orderId: success.orderId
    }),
    1
  );

  assert.equal(
    await models.SandboxOwnership.countDocuments({
      purchaseKey: `order:${success.orderId}`,
      environment: "sandbox"
    }),
    1
  );

  console.log("PASS: REAL CROSS-DATABASE CHECKOUT PREPARATION");

  // 2. Duplicate protection.
  await assert.rejects(execute(success));

  assert.equal(
    await models.SandboxPaymentOperation.countDocuments({
      orderId: success.orderId
    }),
    1
  );

  console.log("PASS: DUPLICATE CHECKOUT BLOCKED");

  // 3. Invalid lock owner.
  const invalid = await fixture();

  await assert.rejects(
    execute(invalid, {
      lock: { ...invalid.lock, owner: crypto.randomUUID() }
    }),
    /V3_SANDBOX_CHECKOUT_LOCK_NOT_VERIFIED/
  );

  console.log("PASS: INVALID CHECKOUT LOCK BLOCKED");

  // 4. Existing Store payment reservation.
  const storeHistory = await fixture();

  await models.StoreSharedReservation.collection.insertOne({
    documentType: "order",
    documentId: storeHistory.orderId,
    environment: "sandbox"
  });

  await assert.rejects(
    execute(storeHistory),
    /Existing payment reservation requires review/
  );

  console.log("PASS: STORE PAYMENT HISTORY BLOCKED");

  // 5. Existing Sandbox payment reservation.
  const sandboxHistory = await fixture();

  await models.SandboxSharedReservation.collection.insertOne({
    documentType: "order",
    documentId: sandboxHistory.orderId,
    environment: "sandbox"
  });

  await assert.rejects(
    execute(sandboxHistory),
    /Existing Sandbox payment reservation requires review/
  );

  console.log("PASS: SANDBOX PAYMENT HISTORY BLOCKED");

  // 6. Existing Sandbox invoice/order association.
  const association = await fixture();

  await models.SandboxAssociation.collection.insertOne({
    orderId: association.orderId,
    environment: "sandbox",
    purchaseKey: `order:${association.orderId}`
  });

  await assert.rejects(
    execute(association),
    /invoice\/order association requires review/
  );

  console.log("PASS: INVOICE ASSOCIATION BLOCKED");

  // 7. Transaction rollback across both databases.
  const rollback = await fixture();

  const before = await Order.findById(rollback.orderId).lean();

  await assert.rejects(
    execute(rollback, {
      simulateFailureAfterOrderSave: true
    }),
    /SIMULATED_DURABLE_ORDER_SAVE_FAILURE/
  );

  const after = await Order.findById(rollback.orderId).lean();

  assert.deepEqual(after, before);

  assert.equal(
    await models.SandboxPaymentOperation.countDocuments({
      orderId: rollback.orderId
    }),
    0
  );

  assert.equal(
    await models.SandboxOwnership.countDocuments({
      purchaseKey: `order:${rollback.orderId}`
    }),
    0
  );

  console.log("PASS: CROSS-DATABASE CHECKOUT ROLLBACK");

  // 8. Two simultaneous requests must never create two payment claims.
  const concurrent = await fixture();

  const attempts = await Promise.allSettled([
    execute(concurrent),
    execute(concurrent)
  ]);

  const succeeded = attempts.filter(
    attempt => attempt.status === "fulfilled"
  );

  const rejected = attempts.filter(
    attempt => attempt.status === "rejected"
  );

  assert.equal(
    succeeded.length,
    1,
    "Exactly one concurrent checkout must succeed."
  );

  assert.equal(
    rejected.length,
    1,
    "Exactly one concurrent checkout must be rejected."
  );

  assert.equal(succeeded[0].value.success, true);
  assert.equal(succeeded[0].value.squareRequestAuthorized, false);
  assert.equal(succeeded[0].value.paymentCreated, false);

  const concurrentOperations =
    await models.SandboxPaymentOperation.find({
      orderId: concurrent.orderId
    }).lean();

  const concurrentOwnership =
    await models.SandboxOwnership.find({
      environment: "sandbox",
      purchaseKey: `order:${concurrent.orderId}`
    }).lean();

  const concurrentOrder =
    await Order.findById(concurrent.orderId).lean();

  assert.equal(
    concurrentOperations.length,
    1,
    "Concurrent checkout created duplicate payment operations."
  );

  assert.equal(
    concurrentOwnership.length,
    1,
    "Concurrent checkout created duplicate ownership records."
  );

  assert.equal(
    concurrentOrder.squareEnvironment,
    "sandbox"
  );

  assert.equal(
    concurrentOrder.squareExpectedAmountCents,
    5528
  );

  assert.equal(concurrentOperations[0].amountCents, 5528);

  assert.equal(
    String(concurrentOperations[0].orderId),
    String(concurrent.orderId)
  );

  assert.equal(
    String(concurrentOwnership[0].claimedByDocumentId),
    String(concurrent.orderId)
  );

  // The winning result must match its one persisted operation.
  assert.equal(
    succeeded[0].value.paymentOperationId,
    String(concurrentOperations[0]._id)
  );

  console.log("PASS: CONCURRENT CHECKOUT SINGLE OWNER");
  console.log("PASS: ONE SANDBOX PAYMENT OPERATION");
  console.log("PASS: ONE SANDBOX PURCHASE OWNERSHIP");
  console.log("PASS: STORE ORDER PAYMENT BINDING CONSISTENT");
  console.log("PASS: CONCURRENT CHECKOUT DID NOT AUTHORIZE SQUARE");
  // ===== CROSS-DATABASE SQUARE RESERVATION BRIDGE =====
  // This reserves existing payment state; it never calls Square.
  const { reserveV3CrossDatabaseSandboxRequest: reserveBridge } =
    await import("../utils/reserveV3CrossDatabaseSandboxRequest.js");

  const reserve = (item, owner = item.lock.owner) =>
    reserveBridge({
      orderId: String(item.orderId),
      owner,
      storefrontConnection: store,
      sandboxConnection: sandbox
    });

  // 9. Transition the already-prepared Sandbox operation.
  const bridgeItem = await fixture();
  await execute(bridgeItem);

  const operationBefore =
    await models.SandboxPaymentOperation.findOne({
      orderId: bridgeItem.orderId
    }).lean();

  assert.ok(operationBefore);
  assert.equal(operationBefore.status, "pending");

  const reserved = await reserve(bridgeItem);

  const operationAfter =
    await models.SandboxPaymentOperation.findOne({
      orderId: bridgeItem.orderId
    }).lean();

  assert.equal(reserved.requestReserved, true);
  assert.equal(reserved.status, "reconciliation_required");
  assert.equal(reserved.squareRequestAuthorized, false);
  assert.equal(reserved.paymentCreated, false);

  assert.equal(
    String(operationAfter._id),
    String(operationBefore._id)
  );

  assert.equal(
    operationAfter.idempotencyKey,
    operationBefore.idempotencyKey
  );

  assert.equal(
    operationAfter.checkoutReferenceId,
    operationBefore.checkoutReferenceId
  );

  assert.equal(operationAfter.requestOwner, bridgeItem.lock.owner);
  assert.equal(operationAfter.status, "reconciliation_required");

  assert.equal(
    await models.SandboxPaymentOperation.countDocuments({
      orderId: bridgeItem.orderId
    }),
    1
  );

  console.log("PASS: BRIDGE PRESERVED PAYMENT IDENTITY");

  // 10. Reservation cannot be repeated.
  await assert.rejects(
    reserve(bridgeItem),
    /V3_RESERVATION_BINDING_REJECTED/
  );

  assert.equal(
    await models.SandboxPaymentOperation.countDocuments({
      orderId: bridgeItem.orderId
    }),
    1
  );

  console.log("PASS: DUPLICATE BRIDGE RESERVATION BLOCKED");

  // 11. Wrong owner must not change a pending operation.
  const wrongOwner = await fixture();
  await execute(wrongOwner);

  await assert.rejects(
    reserve(wrongOwner, crypto.randomUUID()),
    /V3_RESERVATION_LOCK_REJECTED/
  );

  const wrongOwnerOperation =
    await models.SandboxPaymentOperation.findOne({
      orderId: wrongOwner.orderId
    }).lean();

  assert.equal(wrongOwnerOperation.status, "pending");
  assert.equal(wrongOwnerOperation.requestOwner, "");

  console.log("PASS: BRIDGE INVALID OWNER BLOCKED");

  // 12. Historical reservations block execution reservation.
  const historical = await fixture();
  await execute(historical);

  // Respect the existing unique index on
  // environment + idempotencyKey.
  await models.StoreSharedReservation.collection.insertOne({
    documentType: "order",
    documentId: historical.orderId,
    environment: "sandbox",
    idempotencyKey: `signavi-v3-sandbox-${crypto.randomUUID()}`
  });

  await assert.rejects(
    reserve(historical),
    /V3_PAYMENT_HISTORY_REQUIRES_REVIEW/
  );

  const historicalOperation =
    await models.SandboxPaymentOperation.findOne({
      orderId: historical.orderId
    }).lean();

  assert.equal(historicalOperation.status, "pending");

  console.log("PASS: BRIDGE PAYMENT HISTORY BLOCKED");

  // 13. Concurrent reservation attempts: one winner only.
  const concurrentBridge = await fixture();
  await execute(concurrentBridge);

  const attemptsBridge = await Promise.allSettled([
    reserve(concurrentBridge),
    reserve(concurrentBridge)
  ]);

  assert.equal(
    attemptsBridge.filter(x => x.status === "fulfilled").length,
    1
  );

  assert.equal(
    attemptsBridge.filter(x => x.status === "rejected").length,
    1
  );

  const concurrentOperation =
    await models.SandboxPaymentOperation.findOne({
      orderId: concurrentBridge.orderId
    }).lean();

  assert.equal(concurrentOperation.status, "reconciliation_required");
  assert.equal(
    concurrentOperation.requestOwner,
    concurrentBridge.lock.owner
  );

  assert.equal(
    await models.SandboxPaymentOperation.countDocuments({
      orderId: concurrentBridge.orderId
    }),
    1
  );

  console.log("PASS: CONCURRENT BRIDGE SINGLE RESERVATION");
  console.log("PASS: BRIDGE MADE NO SQUARE REQUESTS");
  // ===== CROSS-DATABASE TRUSTED EXECUTOR =====
  // The SDK is fully mocked. The only database is the
  // ephemeral replica created by this acceptance test.

  const executorItem = await fixture();
  await execute(executorItem);

  const reservedExecutor = await reserve(executorItem);

  const beforeExecution =
    await models.SandboxPaymentOperation.findOne({
      orderId: executorItem.orderId
    }).lean();

  assert.equal(
    reservedExecutor.paymentOperationId,
    String(beforeExecution._id)
  );

  const executorDbUri = replica.getUri(
    "signavi_shipping_v3_dev"
  );

  const parsedExecutorUri = new URL(executorDbUri);

  assert.ok(
    ["127.0.0.1", "localhost", "::1"].includes(
      parsedExecutorUri.hostname
    ),
    "Executor MongoDB URI must point to loopback."
  );

  const previousExecutorEnv = {
    V3_SANDBOX_MONGO_URI:
      process.env.V3_SANDBOX_MONGO_URI,
    SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED:
      process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED
  };

  let executorConnection;
  let mockCreateCalls = 0;
  let mockEvidenceLookups = 0;

  try {
    process.env.V3_SANDBOX_MONGO_URI = executorDbUri;
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED =
      "true";

    const { getV3SandboxConnection } = await import(
      "../utils/v3SandboxDatabaseConnection.js"
    );

    const {
      runV3TrustedSandboxExecutionForTests
    } = await import(
      "../utils/smartShippingV3TrustedExecution.js"
    );

    executorConnection = await getV3SandboxConnection();

    assert.equal(
      executorConnection.db.databaseName,
      "signavi_shipping_v3_dev"
    );

    assert.notEqual(executorConnection, store);

    const linkId = `mock-link-${crypto.randomUUID()}`;
    const squareOrderId =
      `mock-square-order-${crypto.randomUUID()}`;

    const paymentUrl =
      "https://square.link/u/mock-cross-database";

    const expectedReference =
      beforeExecution.checkoutReferenceId;

    const mockSdk = {
      merchantId: "mock-merchant",
      locationId: "mock-location",

      verifyIdentity: async () => ({
        verified: true,
        merchantId: "mock-merchant",
        locationId: "mock-location",
        squareRequestAuthorized: false
      }),

      createPaymentLink: async request => {
        mockCreateCalls++;

        assert.equal(mockCreateCalls, 1);

        assert.equal(
          request.idempotencyKey,
          beforeExecution.idempotencyKey
        );

        assert.equal(
          request.order.referenceId,
          expectedReference
        );

        assert.equal(
          request.order.locationId,
          "mock-location"
        );

        assert.equal(
          request.order.lineItems[0]
            .basePriceMoney.amount,
          BigInt(beforeExecution.amountCents)
        );

        return {
          paymentLink: {
            id: linkId,
            orderId: squareOrderId,
            url: paymentUrl
          }
        };
      },

      lookupClient: {
        checkout: {
          paymentLinks: {
            get: async () => {
              mockEvidenceLookups++;

              return {
                paymentLink: {
                  id: linkId,
                  orderId: squareOrderId,
                  url: paymentUrl
                }
              };
            }
          }
        },

        orders: {
          get: async () => {
            mockEvidenceLookups++;

            return {
              order: {
                id: squareOrderId,
                referenceId: expectedReference,
                locationId: "mock-location",
                totalMoney: {
                  amount: BigInt(
                    beforeExecution.amountCents
                  ),
                  currency: "USD"
                }
              }
            };
          }
        }
      }
    };

    const runTrusted = () =>
      runV3TrustedSandboxExecutionForTests({
        orderId: String(executorItem.orderId),
        owner: executorItem.lock.owner,
        sdk: mockSdk
      });

    const trustedResult = await runTrusted();

    assert.equal(trustedResult.status, "completed");
    assert.equal(trustedResult.verified, true);
    assert.equal(trustedResult.paymentLinkRecorded, true);
    assert.equal(
      trustedResult.customerPaymentConfirmed,
      false
    );

    assert.equal(mockCreateCalls, 1);
    assert.equal(mockEvidenceLookups, 2);

    const recorded =
      await models.SandboxPaymentOperation.findOne({
        orderId: executorItem.orderId
      }).lean();

    assert.equal(
      String(recorded._id),
      String(beforeExecution._id)
    );

    assert.equal(
      recorded.idempotencyKey,
      beforeExecution.idempotencyKey
    );

    assert.equal(recorded.status, "completed");
    assert.equal(recorded.squarePaymentLinkId, linkId);
    assert.equal(recorded.squareOrderId, squareOrderId);
    assert.equal(recorded.paymentUrl, paymentUrl);
    assert.ok(recorded.squareCreationAttemptClaimedAt);

    assert.equal(
      await models.SandboxPaymentOperation.countDocuments({
        orderId: executorItem.orderId
      }),
      1
    );

    console.log(
      "PASS: CROSS-DATABASE TRUSTED EXECUTOR RECORDED LINK"
    );

    await assert.rejects(
      runTrusted(),
      /unclaimed reservation not found/
    );

    assert.equal(mockCreateCalls, 1);

    console.log(
      "PASS: CROSS-DATABASE EXECUTOR DUPLICATE BLOCKED"
    );

    // ===== CROSS-DATABASE UNCERTAIN SQUARE OUTCOME =====
    // Fresh order and existing payment operation.
    // Mocked Square fails AFTER the durable creation claim.

    const uncertainItem = await fixture();
    await execute(uncertainItem);
    await reserve(uncertainItem);

    const uncertainBefore =
      await models.SandboxPaymentOperation.findOne({
        orderId: uncertainItem.orderId
      }).lean();

    assert.equal(uncertainBefore.status, "reconciliation_required");
    assert.equal(uncertainBefore.squareCreationAttemptClaimedAt, null);

    let uncertainCreateCalls = 0;

    const uncertainSdk = {
      ...mockSdk,

      createPaymentLink: async () => {
        uncertainCreateCalls++;

        // Transport failures have uncertain external outcomes.
        // Never assume no payment link was created.
        throw new Error("Mock Square transport timeout");
      }
    };

    const runUncertain = () =>
      runV3TrustedSandboxExecutionForTests({
        orderId: String(uncertainItem.orderId),
        owner: uncertainItem.lock.owner,
        sdk: uncertainSdk
      });

    const uncertainResult = await runUncertain();

    assert.equal(
      uncertainResult.status,
      "reconciliation_required"
    );

    assert.equal(
      uncertainResult.safeToRetryCreation,
      false
    );

    assert.equal(uncertainResult.paymentLinkRecorded, false);
    assert.equal(uncertainCreateCalls, 1);

    const uncertainAfter =
      await models.SandboxPaymentOperation.findOne({
        orderId: uncertainItem.orderId
      }).lean();

    assert.equal(
      String(uncertainAfter._id),
      String(uncertainBefore._id)
    );

    assert.equal(
      uncertainAfter.idempotencyKey,
      uncertainBefore.idempotencyKey
    );

    assert.equal(
      uncertainAfter.status,
      "reconciliation_required"
    );

    assert.ok(uncertainAfter.squareCreationAttemptClaimedAt);

    assert.equal(uncertainAfter.squarePaymentLinkId, "");
    assert.equal(uncertainAfter.squareOrderId, "");
    assert.equal(uncertainAfter.paymentUrl, "");

    console.log(
      "PASS: CROSS-DATABASE UNCERTAIN OUTCOME RETAINED CLAIM"
    );

    // Retrying must fail BEFORE a second SDK request.
    await assert.rejects(
      runUncertain(),
      /unclaimed reservation not found/
    );

    assert.equal(uncertainCreateCalls, 1);

    assert.equal(
      await models.SandboxPaymentOperation.countDocuments({
        orderId: uncertainItem.orderId
      }),
      1
    );

    console.log(
      "PASS: CROSS-DATABASE UNCERTAIN OUTCOME NO RETRY"
    );
    // ===== LINK RECORDING FAILURE AFTER MOCK SQUARE SUCCESS =====
    // The mock returns verified link evidence, then makes
    // the durable recording lock expire before persistence.

    const recordingItem = await fixture();
    await execute(recordingItem);
    await reserve(recordingItem);

    const recordingBefore =
      await models.SandboxPaymentOperation.findOne({
        orderId: recordingItem.orderId
      }).lean();

    const recordingLinkId =
      `mock-record-failure-${crypto.randomUUID()}`;

    const recordingSquareOrderId =
      `mock-order-${crypto.randomUUID()}`;

    const recordingPaymentUrl =
      "https://square.link/u/mock-record-failure";

    let recordingCreateCalls = 0;
    let recordingLookups = 0;

    const recordingSdk = {
      merchantId: "mock-merchant",
      locationId: "mock-location",

      verifyIdentity: async () => ({
        verified: true,
        merchantId: "mock-merchant",
        locationId: "mock-location",
        squareRequestAuthorized: false
      }),

      createPaymentLink: async request => {
        recordingCreateCalls++;

        assert.equal(recordingCreateCalls, 1);
        assert.equal(
          request.idempotencyKey,
          recordingBefore.idempotencyKey
        );

        // Simulate a recording transaction that cannot
        // acquire its previously valid ownership lock.
        const expired = await sandbox
          .collection("smart_shipping_v3_checkout_locks")
          .updateOne(
            {
              _id: recordingItem.orderId,
              owner: recordingItem.lock.owner
            },
            {
              $set: {
                expiresAt: new Date(Date.now() - 1000)
              }
            }
          );

        assert.equal(expired.matchedCount, 1);

        return {
          paymentLink: {
            id: recordingLinkId,
            orderId: recordingSquareOrderId,
            url: recordingPaymentUrl
          }
        };
      },

      lookupClient: {
        checkout: {
          paymentLinks: {
            get: async () => {
              recordingLookups++;

              return {
                paymentLink: {
                  id: recordingLinkId,
                  orderId: recordingSquareOrderId,
                  url: recordingPaymentUrl
                }
              };
            }
          }
        },

        orders: {
          get: async () => {
            recordingLookups++;

            return {
              order: {
                id: recordingSquareOrderId,
                referenceId:
                  recordingBefore.checkoutReferenceId,
                locationId: "mock-location",
                totalMoney: {
                  amount: BigInt(recordingBefore.amountCents),
                  currency: "USD"
                }
              }
            };
          }
        }
      }
    };

    const runRecordingFailure = () =>
      runV3TrustedSandboxExecutionForTests({
        orderId: String(recordingItem.orderId),
        owner: recordingItem.lock.owner,
        sdk: recordingSdk
      });

    const recordingResult = await runRecordingFailure();

    assert.equal(
      recordingResult.status,
      "reconciliation_required"
    );

    assert.equal(recordingResult.paymentLinkRecorded, false);
    assert.equal(recordingResult.safeToRetryCreation, false);

    assert.equal(recordingCreateCalls, 1);
    assert.equal(recordingLookups, 2);

    const recordingAfter =
      await models.SandboxPaymentOperation.findOne({
        orderId: recordingItem.orderId
      }).lean();

    assert.equal(
      String(recordingAfter._id),
      String(recordingBefore._id)
    );

    assert.equal(
      recordingAfter.idempotencyKey,
      recordingBefore.idempotencyKey
    );

    assert.equal(
      recordingAfter.status,
      "reconciliation_required"
    );

    assert.ok(recordingAfter.squareCreationAttemptClaimedAt);
    assert.equal(recordingAfter.squarePaymentLinkId, "");
    assert.equal(recordingAfter.squareOrderId, "");
    assert.equal(recordingAfter.paymentUrl, "");

    console.log(
      "PASS: CROSS-DATABASE LINK RECORDING FAILURE BLOCKED"
    );

    await assert.rejects(
      runRecordingFailure(),
      /unclaimed reservation not found/
    );

    assert.equal(recordingCreateCalls, 1);

    console.log(
      "PASS: RECORDING FAILURE DID NOT RETRY SQUARE"
    );
    console.log(
      "PASS: ONE MOCK SQUARE CREATION, NO REAL REQUESTS"
    );
  } finally {
    if (executorConnection) {
      await executorConnection.close();
    }

    for (const [name, value] of Object.entries(
      previousExecutorEnv
    )) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
  console.log("\nREAL CROSS-DATABASE ACCEPTANCE TEST PASSED");
  console.log("NO SQUARE REQUESTS");
} finally {
  await mongoose.disconnect();
  await replica.stop();
  console.log("PASS: TEST REPLICA CLOSED");
}