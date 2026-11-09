import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3ProductionSquareReconciliationService
} from "../utils/createV3ProductionSquareReconciliationService.js";

const orderId = "abcdef123456abcdef123456";

const saved = {
  NODE_ENV: process.env.NODE_ENV,
  SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT,
  SQUARE_PRODUCTION_LOCATION_ID:
    process.env.SQUARE_PRODUCTION_LOCATION_ID,
  SQUARE_PRODUCTION_ACCESS_TOKEN:
    process.env.SQUARE_PRODUCTION_ACCESS_TOKEN
};

test.after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const setup = () => {
  process.env.NODE_ENV = "test";
  process.env.SQUARE_PRODUCTION_LOCATION_ID = "test_location";
};

const fakeClient = ({
  links = [],
  notes = {},
  failOrder = false
} = {}) => {
  const calls = {
    list: 0,
    orderReads: 0,
    creates: 0
  };

  const client = {
    checkout: {
      paymentLinks: {
        list(request, options) {
          calls.list++;
          assert.equal(options.maxRetries, 0);

          return {
            async withRawResponse() {
              return {
                data: { paymentLinks: links }
              };
            }
          };
        },
        create() {
          calls.creates++;
          throw new Error("PAYMENT_CREATION_FORBIDDEN");
        }
      }
    },

    orders: {
      async get({ orderId: squareId }, options) {
        calls.orderReads++;
        assert.equal(options.maxRetries, 0);

        if (failOrder) {
          throw new Error("SIMULATED_ORDER_READ_FAILURE");
        }

        return {
          order: {
            id: squareId,
            note: notes[squareId]
          }
        };
      }
    }
  };

  return { client, calls };
};

test("finds historical Square order without creating payment", async () => {
  setup();

  const { client, calls } = fakeClient({
    links: [{ id: "link_1", orderId: "square_1" }],
    notes: { square_1: `ID:${orderId}` }
  });

  const service =
    createV3ProductionSquareReconciliationService({
      testClient: client
    });

  const result = await service.reconcile({ orderId });

  assert.equal(result.complete, true);
  assert.equal(result.priorActivityFound, true);
  assert.deepEqual(result.matchedLinkIds, ["link_1"]);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(calls.creates, 0);
  assert.equal(calls.list, 1);
  assert.equal(calls.orderReads, 1);
});

test("empty history does not authorize payment", async () => {
  setup();

  const { client, calls } = fakeClient();

  const result =
    await createV3ProductionSquareReconciliationService({
      testClient: client
    }).reconcile({ orderId });

  assert.equal(result.complete, true);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(calls.creates, 0);
});

test("Square order read failure blocks safely", async () => {
  setup();

  const { client } = fakeClient({
    links: [{ id: "link_1", orderId: "square_1" }],
    failOrder: true
  });

  const result =
    await createV3ProductionSquareReconciliationService({
      testClient: client
    }).reconcile({ orderId });

  assert.equal(result.complete, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("rejects injected clients outside test mode", () => {
  setup();
  process.env.NODE_ENV = "production";

  const { client } = fakeClient();

  assert.throws(
    () => createV3ProductionSquareReconciliationService({
      testClient: client
    }),
    /SQUARE_TEST_CLIENT_FORBIDDEN/
  );
});

test("production requires server credentials", () => {
  setup();
  process.env.NODE_ENV = "production";
  process.env.SQUARE_ENVIRONMENT = "production";
  delete process.env.SQUARE_PRODUCTION_ACCESS_TOKEN;

  assert.throws(
    () => createV3ProductionSquareReconciliationService(),
    /SQUARE_PRODUCTION_TOKEN_REQUIRED/
  );
});

test("invalid read client fails closed", () => {
  setup();

  assert.throws(
    () => createV3ProductionSquareReconciliationService({
      testClient: {
        checkout: { paymentLinks: { list() {} } }
      }
    }),
    /SQUARE_READ_CLIENT_INCOMPLETE/
  );
});