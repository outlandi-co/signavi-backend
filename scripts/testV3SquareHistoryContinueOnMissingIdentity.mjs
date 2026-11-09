import test from "node:test";
import assert from "node:assert/strict";

import {
  inspectV3SquareHistoryOrderNotes
} from "../utils/inspectV3SquareHistoryOrderNotes.js";

const id = "6aed51ec0248a4fcda21ae1c";

const inspect = orders =>
  inspectV3SquareHistoryOrderNotes({
    orderId: id,
    history: {
      complete: true,
      links: [
        { id: "link-1", orderId: "order-1" },
        { id: "link-2", orderId: "order-2" }
      ]
    },
    readSquareOrder: async ({ squareOrderId }) => ({
      order: orders[squareOrderId]
    })
  });

test("later match is found after incomplete first order", async () => {
  const result = await inspect({
    "order-1": { id: "order-1" },
    "order-2": {
      id: "order-2",
      referenceId: `signavi-v3-${id}`
    }
  });

  assert.equal(result.complete, false);
  assert.equal(result.priorActivityFound, true);
  assert.deepEqual(result.matchedLinkIds, ["link-2"]);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
});

test("missing identities remain incomplete with no matches", async () => {
  const result = await inspect({
    "order-1": { id: "order-1" },
    "order-2": { id: "order-2" }
  });

  assert.equal(result.complete, false);
  assert.equal(result.priorActivityFound, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
});