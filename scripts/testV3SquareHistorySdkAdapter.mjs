import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3SquareHistoryFromSdk
} from "../utils/collectV3SquareHistoryFromSdk.js";

const fakePage = data => ({
  async withRawResponse() {
    return { data, response: { status: 200 } };
  }
});

test("uses Square SDK pagination without payment creation", async () => {
  const requests = [];
  let createCalls = 0;

  const client = {
    list(request, options) {
      requests.push({ request, options });

      return fakePage(
        request.cursor
          ? {
              paymentLinks: [
                { id: "link_2", orderId: "square_order_2" }
              ]
            }
          : {
              paymentLinks: [
                { id: "link_1", orderId: "square_order_1" }
              ],
              cursor: "second_page"
            }
      );
    },

    create() {
      createCalls++;
      throw new Error("PAYMENT_CREATION_FORBIDDEN");
    }
  };

  const result = await collectV3SquareHistoryFromSdk({
    paymentLinksClient: client
  });

  assert.equal(result.complete, true);
  assert.equal(result.links.length, 2);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].request.limit, 1000);
  assert.equal(requests[1].request.cursor, "second_page");
  assert.equal(requests[0].options.maxRetries, 0);
  assert.equal(requests[1].options.maxRetries, 0);
  assert.equal(createCalls, 0);
  assert.equal(result.squareRequestAuthorized, false);
});

test("missing SDK client fails closed", async () => {
  const result = await collectV3SquareHistoryFromSdk();

  assert.equal(result.complete, false);
  assert.equal(result.reason, "SQUARE_LIST_CLIENT_REQUIRED");
  assert.equal(result.squareRequestAuthorized, false);
});

test("SDK request failure fails closed", async () => {
  const result = await collectV3SquareHistoryFromSdk({
    paymentLinksClient: {
      list() {
        throw new Error("Simulated SDK failure");
      }
    }
  });

  assert.equal(result.complete, false);
  assert.equal(result.links.length, 0);
  assert.equal(result.squareRequestAuthorized, false);
});

test("invalid SDK Page fails closed", async () => {
  const result = await collectV3SquareHistoryFromSdk({
    paymentLinksClient: {
      list() {
        return {};
      }
    }
  });

  assert.equal(result.complete, false);
  assert.equal(result.links.length, 0);
  assert.equal(result.squareRequestAuthorized, false);
});

test("malformed page data fails closed", async () => {
  const result = await collectV3SquareHistoryFromSdk({
    paymentLinksClient: {
      list() {
        return fakePage({ unexpected: true });
      }
    }
  });

  assert.equal(result.complete, false);
  assert.equal(result.links.length, 0);
  assert.equal(result.squareRequestAuthorized, false);
});

test("empty Square listing never authorizes payment", async () => {
  const result = await collectV3SquareHistoryFromSdk({
    paymentLinksClient: {
      list() {
        return fakePage({ paymentLinks: [] });
      }
    }
  });

  assert.equal(result.complete, true);
  assert.equal(result.links.length, 0);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});