
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  verifyV3SandboxInitializationEvidence
} from "../utils/verifyV3SandboxInitializationEvidence.js";

test("untrusted callback cannot authorize a missing-context preflight", async () => {
  const result = await verifyV3SandboxInitializationEvidence({
    checkPaymentHistory: async () => ({
      verified: true,
      noPriorPaymentActivity: true
    })
  });

  assert.equal(result.verified, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("payment history success branch remains explicitly fail-closed", () => {
  const source = fs.readFileSync(
    new URL("../utils/verifyV3SandboxInitializationEvidence.js", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /return blocked\("TRUSTED_PAYMENT_HISTORY_AUTHORITY_NOT_CONNECTED"\)/
  );

  assert.doesNotMatch(
    source.replace(/\/\*[\s\S]*?\*\//g, ""),
    /verified: true/
  );
});
