import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const model = readFileSync(
  new URL("../models/Order.js", import.meta.url),
  "utf8"
);

const route = readFileSync(
  new URL("../routes/orders.js", import.meta.url),
  "utf8"
);

test("provenance fields exist in Order schema", () => {
  assert.match(
    model,
    /v3FirstAttemptProvenanceVersion:\s*\{/
  );

  assert.match(
    model,
    /v3FirstAttemptProvenanceIssuedAt:\s*\{/
  );
});

test("both provenance fields are immutable", () => {
  const version = model.match(
    /v3FirstAttemptProvenanceVersion:\s*\{([^}]+)\}/
  );

  const issued = model.match(
    /v3FirstAttemptProvenanceIssuedAt:\s*\{([^}]+)\}/
  );

  assert.ok(version);
  assert.ok(issued);
  assert.match(version[1], /immutable:\s*true/);
  assert.match(issued[1], /immutable:\s*true/);
});

test("new V3 store orders receive server-generated provenance", () => {
  const start = route.indexOf("const rate = null");
  const end = route.indexOf("timeline: [{", start);

  assert.ok(start >= 0 && end > start);

  const creation = route.slice(start, end);

  assert.match(
    creation,
    /getSmartShippingCheckoutVersion\(\)\s*===\s*"v3"/
  );

  assert.match(
    creation,
    /v3FirstAttemptProvenanceVersion:/
  );

  assert.match(
    creation,
    /v3FirstAttemptProvenanceIssuedAt:\s*new Date\(\)/
  );

  assert.doesNotMatch(
    creation,
    /v3FirstAttemptProvenanceIssuedAt:\s*b\./
  );
});

test("existing admin PATCH does not assign provenance", () => {
  const patchMatch = /router\.patch\(\s*["']\/:id["']\s*,/.exec(route);

  assert.ok(patchMatch, "Admin PATCH route must exist");

  const start = patchMatch.index;

  const end = route.indexOf(
    "await order.save()",
    start
  );

  assert.ok(start >= 0 && end > start);

  const update = route.slice(start, end);

  assert.doesNotMatch(
    update,
    /order\.v3FirstAttemptProvenanceVersion\s*=/
  );

  assert.doesNotMatch(
    update,
    /order\.v3FirstAttemptProvenanceIssuedAt\s*=/
  );
});

test("production checkout remains locked", () => {
  assert.match(
    route,
    /const gate = denyV3ProductionCheckout\(\)/
  );
});