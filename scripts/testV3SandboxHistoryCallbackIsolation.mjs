
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  verifyV3SandboxInitializationEvidence
} from "../utils/verifyV3SandboxInitializationEvidence.js";

const source = fs.readFileSync(
  new URL("../utils/verifyV3SandboxInitializationEvidence.js", import.meta.url),
  "utf8"
);

test("untrusted history callback cannot influence evidence", async () => {
  let invoked = false;

  const result = await verifyV3SandboxInitializationEvidence({
    checkPaymentHistory: async () => {
      invoked = true;
      return {
        verified: true,
        noPriorPaymentActivity: true
      };
    }
  });

  assert.equal(invoked, false);
  assert.equal(result.verified, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("verifier no longer invokes caller history callback", () => {
  assert.doesNotMatch(source, /await checkPaymentHistory\s*\(/);
  assert.doesNotMatch(source, /typeof checkPaymentHistory/);
  assert.doesNotMatch(source, /verified:\s*true/);
  assert.doesNotMatch(source, /Retained legacy result shape/);
});

test("trusted authority remains disconnected", () => {
  assert.match(
    source,
    /return blocked\("TRUSTED_PAYMENT_HISTORY_AUTHORITY_NOT_CONNECTED"\)/
  );

  assert.match(
    source,
    /checkV3CrossDatabaseInvoiceAssociations\s*\(/
  );
});
