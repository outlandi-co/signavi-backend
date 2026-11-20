import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";

import {
  auditSquarePaymentDuplicates
} from "./auditSquarePaymentDuplicates.mjs";

import {
  planSquarePaymentIndexMigration
} from "./planSquarePaymentIndexMigration.mjs";

const binaryPath = process.env.SIGNAVI_TEST_MONGOD_BINARY;

if (!binaryPath || !existsSync(binaryPath)) {
  throw new Error("ISOLATED_MONGODB_BINARY_REQUIRED");
}

const server = await MongoMemoryServer.create({
  binary: {
    systemBinary: binaryPath,
    version: "9.0.4"
  },
  instance: {
    ip: "127.0.0.1"
  }
});

const uri = server.getUri();

if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(uri)) {
  await server.stop();
  throw new Error("UNEXPECTED_MONGODB_TEST_ADDRESS");
}

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 5000
});

try {
  await client.connect();

  const collection = client
    .db("signavi_square_audit_disposable")
    .collection("orders");

  await test("Empty collection has zero duplicate groups", async () => {
    const counts = await auditSquarePaymentDuplicates({
      collection
    });

    assert.deepEqual({ ...counts }, {
      squareOrderId: 0,
      squarePaymentId: 0
    });
  });

  await test("Missing and empty Square IDs are excluded", async () => {
    await collection.insertMany([
      { squareOrderId: "", squarePaymentId: "" },
      { squareOrderId: "", squarePaymentId: "" },
      { status: "unpaid" },
      { squareOrderId: null, squarePaymentId: null }
    ]);

    const counts = await auditSquarePaymentDuplicates({
      collection
    });

    assert.equal(counts.squareOrderId, 0);
    assert.equal(counts.squarePaymentId, 0);
  });

  await test("Actual MongoDB duplicate identifiers are counted", async () => {
    await collection.insertMany([
      {
        squareOrderId: "order-A",
        squarePaymentId: "payment-A"
      },
      {
        squareOrderId: "order-A",
        squarePaymentId: "payment-A"
      },
      {
        squareOrderId: "order-B",
        squarePaymentId: "payment-B"
      },
      {
        squareOrderId: "order-B",
        squarePaymentId: "payment-C"
      }
    ]);

    const counts = await auditSquarePaymentDuplicates({
      collection
    });

    assert.deepEqual({ ...counts }, {
      squareOrderId: 2,
      squarePaymentId: 1
    });

    assert.equal(
      Object.keys(counts).length,
      2
    );
  });

  await test("Real duplicate audit blocks migration planning", async () => {
    const result = await planSquarePaymentIndexMigration({
      listIndexes: async () =>
        collection.listIndexes().toArray(),

      auditDuplicates: async () =>
        auditSquarePaymentDuplicates({ collection })
    });

    assert.equal(result.safe, false);
    assert.equal(result.action, "stop");
    assert.equal(
      result.reason,
      "duplicate-square-identifiers"
    );
    assert.equal(result.mayCreateIndex, false);
    assert.equal(result.mayExecutePayment, false);
  });

  await test("Unavailable collection fails closed", async () => {
    await assert.rejects(
      auditSquarePaymentDuplicates(),
      /SQUARE_AUDIT_COLLECTION_REQUIRED/
    );
  });

  console.log(
    "REAL_MONGODB_SQUARE_DUPLICATE_AUDIT_VERIFIED"
  );

} finally {
  await client.close();
  await server.stop();
}
