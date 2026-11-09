/**
 * TEST-ONLY shared-session initialization primitive.
 *
 * Does not authorize checkout, initialize real application
 * records, or contact Square.
 */
export async function runV3LocalAtomicInitializationClaim({
  client,
  collectionPrefix,
  orderId,
  expectedRevision = 0,
  owner,
  injectFailure = false
} = {}) {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox"
  ) {
    throw new Error("V3_ATOMIC_CLAIM_TEST_ONLY");
  }

  if (
    !/^v3_tx_probe_[a-f0-9]{32}$/.test(collectionPrefix ?? "") ||
    !/^synthetic-[a-z0-9-]+$/.test(orderId ?? "") ||
    typeof owner !== "string" ||
    !owner.trim() ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    throw new Error("V3_ATOMIC_CLAIM_INVALID_TEST_IDENTITY");
  }

  const hosts = client?.options?.hosts;

  if (
    !Array.isArray(hosts) ||
    hosts.length !== 1 ||
    String(hosts[0]) !== "127.0.0.1:27028"
  ) {
    throw new Error("V3_ATOMIC_CLAIM_LOCAL_CLIENT_REQUIRED");
  }

  const hello = await client.db("admin").command({ hello: 1 });

  if (
    hello.setName !== "signaviV3TestRS" ||
    hello.isWritablePrimary !== true
  ) {
    throw new Error("V3_ATOMIC_CLAIM_REPLICA_SET_REQUIRED");
  }

  const store = client.db("signavi_store")
    .collection(`${collectionPrefix}_store`);

  const orders = client.db("signavi_shipping_v3_dev")
    .collection(`${collectionPrefix}_orders`);

  const operations = client.db("signavi_shipping_v3_dev")
    .collection(`${collectionPrefix}_operations`);

  const session = client.startSession();

  try {
    return await session.withTransaction(async () => {
      const claim = await store.updateOne(
        {
          _id: orderId,
          revision: expectedRevision,
          owner: null,
          paymentStatus: "unpaid"
        },
        {
          $set: { owner },
          $inc: { revision: 1 }
        },
        { session }
      );

      if (claim.matchedCount !== 1) {
        throw new Error("V3_INITIALIZATION_OWNERSHIP_REJECTED");
      }

      const previousOrder = await orders.findOne(
        { _id: orderId },
        { session }
      );

      const previousOperation = await operations.findOne(
        { _id: orderId },
        { session }
      );

      if (previousOrder || previousOperation) {
        throw new Error("V3_INITIALIZATION_ALREADY_EXISTS");
      }

      await orders.insertOne(
        { _id: orderId, owner, status: "unpaid" },
        { session }
      );

      if (injectFailure) {
        throw new Error("V3_TEST_INJECTED_ROLLBACK");
      }

      await operations.insertOne(
        { _id: orderId, owner, status: "pending" },
        { session }
      );

      return Object.freeze({
        initialized: true,
        owner,
        orderId,
        paymentCreated: false,
        squareRequestAuthorized: false,
        retryAuthorized: false
      });
    });
  } finally {
    await session.endSession();
  }
}