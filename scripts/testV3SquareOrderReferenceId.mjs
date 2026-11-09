import test from "node:test";
import assert from "node:assert/strict";

import {
  inspectV3SquareHistoryOrderNotes
} from "../utils/inspectV3SquareHistoryOrderNotes.js";

const id = "6aed51ec0248a4fcda21ae1c";

const history = {
  complete: true,
  links: [{
    id: "square-link-1",
    orderId: "square-order-1"
  }]
};

const inspect = order =>
  inspectV3SquareHistoryOrderNotes({
    orderId: id,
    history,
    readSquareOrder: async () => ({ order })
  });

test("legacy referenceId identifies prior activity without note", async () => {
  const result = await inspect({
    id: "square-order-1",
    referenceId: `ID:${id}`
  });

  assert.equal(result.complete, true);
  assert.equal(result.priorActivityFound, true);
  assert.deepEqual(result.matchedLinkIds, ["square-link-1"]);
  assert.equal(result.squareRequestAuthorized, false);
});

test("V3 purchase referenceId identifies prior activity without note", async () => {
  const result = await inspect({
    id: "square-order-1",
    referenceId: `signavi-v3-production-purchase-${id}`
  });

  assert.equal(result.complete, true);
  assert.equal(result.priorActivityFound, true);
  assert.equal(result.squareRequestAuthorized, false);
});

test("unrelated reference with missing note remains incomplete", async () => {
  const result = await inspect({
    id: "square-order-1",
    referenceId: "unrelated-order"
  });

  assert.equal(result.complete, false);
  assert.equal(result.priorActivityFound, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("extended order reference cannot match", async () => {
  const result = await inspect({
    id: "square-order-1",
    referenceId: `ID:${id}extra`
  });

  assert.equal(result.complete, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("missing note and reference remain blocked", async () => {
  const result = await inspect({
    id: "square-order-1"
  });

  assert.equal(result.complete, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("unrelated complete history never authorizes payment", async () => {
  const result = await inspect({
    id: "square-order-1",
    note: "unrelated-order",
    referenceId: "unrelated-order"
  });

  assert.equal(result.complete, true);
  assert.equal(result.priorActivityFound, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
});