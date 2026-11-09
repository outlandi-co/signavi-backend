import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3SquarePaymentLinkHistory
} from "../utils/collectV3SquarePaymentLinkHistory.js";

test("collects every page without authorizing payment", async () => {
  let calls = 0;

  const result = await collectV3SquarePaymentLinkHistory({
    listPage: async ({ cursor } = {}) => {
      calls++;

      if (!cursor) {
        return {
          paymentLinks: [{ id: "link_1", orderId: "order_1" }],
          cursor: "page_2"
        };
      }

      assert.equal(cursor, "page_2");

      return {
        paymentLinks: [{ id: "link_2", orderId: "order_2" }]
      };
    }
  });

  assert.equal(calls, 2);
  assert.equal(result.complete, true);
  assert.equal(result.links.length, 2);
  assert.equal(result.squareRequestAuthorized, false);
});

test("API failures fail closed", async () => {
  const result = await collectV3SquarePaymentLinkHistory({
    listPage: async () => {
      throw new Error("Simulated API failure");
    }
  });

  assert.equal(result.complete, false);
  assert.equal(result.links.length, 0);
  assert.equal(result.squareRequestAuthorized, false);
});

test("pagination limit fails closed", async () => {
  const result = await collectV3SquarePaymentLinkHistory({
    maxPages: 2,
    listPage: async ({ cursor } = {}) => ({
      paymentLinks: [{ id: cursor || "first" }],
      cursor: cursor ? "third" : "second"
    })
  });

  assert.equal(result.complete, false);
  assert.equal(result.reason, "SQUARE_HISTORY_PAGE_LIMIT_REACHED");
  assert.equal(result.squareRequestAuthorized, false);
});

test("duplicate link identities fail closed", async () => {
  const result = await collectV3SquarePaymentLinkHistory({
    listPage: async ({ cursor } = {}) => ({
      paymentLinks: [{ id: "duplicate" }],
      ...(cursor ? {} : { cursor: "next" })
    })
  });

  assert.equal(result.complete, false);
  assert.equal(result.reason, "SQUARE_HISTORY_DUPLICATE_LINK");
  assert.equal(result.squareRequestAuthorized, false);
});

test("empty history does not authorize checkout", async () => {
  const result = await collectV3SquarePaymentLinkHistory({
    listPage: async () => ({
      paymentLinks: []
    })
  });

  assert.equal(result.complete, true);
  assert.equal(result.links.length, 0);
  assert.equal(result.squareRequestAuthorized, false);
});