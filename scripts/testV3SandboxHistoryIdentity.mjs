import test from "node:test";
import assert from "node:assert/strict";

import {
  inspectV3SquareHistoryOrderNotes
} from "../utils/inspectV3SquareHistoryOrderNotes.js";

const id = "6aed51ec0248a4fcda21ae1c";

async function inspect(order) {
  return inspectV3SquareHistoryOrderNotes({
    orderId: id,
    history: {
      complete: true,
      links: [{
        id: "link-1",
        orderId: "square-order-1"
      }]
    },
    readSquareOrder: async () => ({
      order: {
        id: "square-order-1",
        ...order
      }
    })
  });
}

for (const referenceId of [
  `signavi-v3-sandbox-${id}`,
  `signavi-v3-${id}`
]) {
  test(`detects Sandbox reference ${referenceId}`, async () => {
    const result = await inspect({ referenceId });

    assert.equal(result.priorActivityFound, true);
    assert.deepEqual(result.matchedLinkIds, ["link-1"]);
    assert.equal(result.squareRequestAuthorized, false);
    assert.equal(result.authoritativeNoPriorActivity, false);
  });
}

test("detects exact Signavi Sandbox order note", async () => {
  const result = await inspect({
    note: `SignaVi V3 Sandbox Order ${id}`
  });

  assert.equal(result.priorActivityFound, true);
  assert.equal(result.squareRequestAuthorized, false);
});

test("extended Sandbox reference cannot match", async () => {
  const result = await inspect({
    referenceId: `signavi-v3-${id}extra`
  });

  assert.equal(result.priorActivityFound, false);
  assert.equal(result.complete, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("missing identity cannot establish clearance", async () => {
  const result = await inspect({});

  assert.equal(result.complete, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
});