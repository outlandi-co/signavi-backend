import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("legacy storefront Square creation remains guarded", () => {
  const source = read("../routes/square.js");

  const guard = source.indexOf(
    '"payment_execution_not_authorized"'
  );

  const creation = source.indexOf(
    "await client.checkout.paymentLinks.create("
  );

  assert.ok(guard >= 0, "Legacy denial reason missing");
  assert.ok(creation > guard, "Square creation must follow guard");

  const returnStart = source.lastIndexOf(
    "return res.status(423).json({",
    guard
  );

  assert.ok(
    returnStart >= 0,
    "Expected HTTP 423 return before denial reason"
  );

  const between = source.slice(returnStart, creation);

  assert.match(
    between,
    /return res\.status\(423\)\.json\(\{[\s\S]*?reason:\s*"payment_execution_not_authorized"[\s\S]*?\}\)\s*const response\s*=/,
    "Expected unconditional HTTP 423 return before Square call"
  );
});

test("invoice Square creation remains guarded", () => {
  const source = read("../controllers/invoiceController.js");

  const start = source.indexOf(
    "const createSquarePaymentLinkForInvoice"
  );

  const creation = source.indexOf(
    "await squareClient.checkout.paymentLinks.create(",
    start
  );

  assert.ok(start >= 0, "Invoice payment function missing");
  assert.ok(creation > start, "Invoice Square creation missing");

  const beforeCreation = source.slice(start, creation);

  assert.match(
    beforeCreation,
    /throw Object\.assign\(\s*new Error\(\s*"Invoice payment-link creation is disabled pending durable payment execution\."\s*\),\s*\{\s*status:\s*423\s*\}\s*\)/,
    "Expected unconditional invoice denial before Square call"
  );
});

test("V3 production checkout remains guarded", () => {
  const source = read("../routes/orders.js");

  assert.match(
    source,
    /const gate = denyV3ProductionCheckout\(\)/
  );

  assert.match(
    source,
    /return res\.status\(gate\.httpStatus\)\.json\(gate\.body\)/
  );
});