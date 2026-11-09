import test from "node:test";
import assert from "node:assert/strict";

import {
  matchV3SquareHistoryToOrder
} from "../utils/matchV3SquareHistoryToOrder.js";

const orderId = "abcdef123456abcdef123456";

const check = links => matchV3SquareHistoryToOrder({
  orderId,
  history: { complete: true, links }
});

test("legacy order reference identifies prior activity", () => {
  const result = check([{
    id: "old_link",
    paymentNote: `Payment ID:${orderId}`
  }]);

  assert.equal(result.priorActivityFound, true);
  assert.deepEqual(result.matchedLinkIds, ["old_link"]);
  assert.equal(result.squareRequestAuthorized, false);
});

test("V3 purchase reference identifies prior activity", () => {
  const result = check([{
    id: "v3_link",
    description:
      `signavi-v3-production-purchase-${orderId}`
  }]);

  assert.equal(result.priorActivityFound, true);
  assert.equal(result.squareRequestAuthorized, false);
});

test("unrelated history never establishes clearance", () => {
  const result = check([{
    id: "other_link",
    description: "Unrelated customer checkout"
  }]);

  assert.equal(result.priorActivityFound, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("empty history never authorizes payment", () => {
  const result = check([]);

  assert.equal(result.reason, "NO_EXPLICIT_HISTORY_MATCH");
  assert.equal(result.verified, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
});

test("incomplete pagination blocks matching", () => {
  const result = matchV3SquareHistoryToOrder({
    orderId,
    history: {
      complete: false,
      links: [{ id: "partial_link" }]
    }
  });

  assert.equal(result.reason, "SQUARE_HISTORY_INCOMPLETE");
  assert.equal(result.squareRequestAuthorized, false);
});

test("an extended identifier is not a match", () => {
  const result = check([{
    id: "different_link",
    paymentNote: `ID:${orderId}abc`
  }]);

  assert.equal(result.priorActivityFound, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
});

test("malformed link records fail closed", () => {
  const result = check([{ description: "Missing link ID" }]);

  assert.equal(result.reason, "SQUARE_HISTORY_IDENTITY_INVALID");
  assert.equal(result.squareRequestAuthorized, false);
});