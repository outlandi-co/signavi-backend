import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3SandboxOrderRecordEvidence
} from "../utils/collectV3SandboxOrderRecordEvidence.js";

import {
  collectV3SandboxPaymentRecordEvidence
} from "../utils/collectV3SandboxPaymentRecordEvidence.js";

const orderId = "a".repeat(24);

const sources = [
  {
    name: "Square Orders",
    collect: collectV3SandboxOrderRecordEvidence,
    field: "orders"
  },
  {
    name: "Square Payments",
    collect: collectV3SandboxPaymentRecordEvidence,
    field: "payments"
  }
];

function assertNotAuthorized(result) {
  assert.equal(
    result.authoritativeNoPriorActivity,
    false
  );

  assert.equal(
    result.squareRequestAuthorized,
    false
  );

  assert.equal(
    result.retryAuthorized,
    false
  );
}

for (const source of sources) {
  test(
    `${source.name}: repeated cursor cannot establish clearance`,
    async () => {
      let calls = 0;

      const result = await source.collect({
        orderId,
        maxPages: 3,
        async listPage() {
          calls++;

          if (calls > 3) {
            throw new Error(
              "PAGINATION_EXCEEDED_CONFIGURED_PAGE_LIMIT"
            );
          }

          return {
            [source.field]: [],
            cursor: "repeated_cursor"
          };
        }
      });

      assert.ok(calls <= 3);
      assert.equal(result.complete, false);
      assertNotAuthorized(result);
    }
  );

  test(
    `${source.name}: late history failure cannot establish clearance`,
    async () => {
      let calls = 0;

      const result = await source.collect({
        orderId,
        maxPages: 3,
        async listPage() {
          calls++;

          if (calls === 1) {
            return {
              [source.field]: [],
              cursor: "second_page"
            };
          }

          throw new Error("SIMULATED_LATE_SQUARE_FAILURE");
        }
      });

      assert.equal(calls, 2);
      assert.equal(result.complete, false);
      assertNotAuthorized(result);
    }
  );

  test(
    `${source.name}: empty completed history remains review-only`,
    async () => {
      const result = await source.collect({
        orderId,
        maxPages: 3,
        async listPage() {
          return {
            [source.field]: [],
            cursor: null
          };
        }
      });

      assert.equal(result.priorActivityFound, false);
      assertNotAuthorized(result);

      // No source is allowed to manufacture authority
      // merely because no matching record was observed.
    }
  );
}
