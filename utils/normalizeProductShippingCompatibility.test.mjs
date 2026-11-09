import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeProductShippingCompatibility as normalize
} from "./normalizeProductShippingCompatibility.mjs";

test("defaults to compatible shipping", () => {
  const result = normalize({});
  assert.equal(result.compatibilityMode, "combine");
  assert.equal(result.shipSeparately, false);
  assert.equal(result.maxUnitsPerPackage, null);
});

test("preserves existing shipSeparately true", () => {
  const result = normalize({ shipSeparately: true });
  assert.equal(result.compatibilityMode, "separate");
  assert.equal(result.shipSeparately, true);
});

test("supports protected keytags", () => {
  const result = normalize({
    compatibilityMode: "protected"
  });
  assert.equal(result.requiresProtection, true);
  assert.equal(result.shipSeparately, false);
});

test("supports oversized canopy with one unit per package", () => {
  const result = normalize({
    compatibilityMode: "separate",
    oversized: true,
    maxUnitsPerPackage: 1
  });
  assert.equal(result.shipSeparately, true);
  assert.equal(result.oversized, true);
  assert.equal(result.maxUnitsPerPackage, 1);
});

test("supports multiple compatible units per package", () => {
  const result = normalize({
    compatibilityMode: "combine",
    maxUnitsPerPackage: 12
  });
  assert.equal(result.maxUnitsPerPackage, 12);
});

test("rejects invalid compatibility modes", () => {
  assert.throws(
    () => normalize({ compatibilityMode: "anything" }),
    /Invalid shipping compatibility mode/
  );
});

test("rejects conflicting legacy separation", () => {
  assert.throws(
    () => normalize({
      shipSeparately: true,
      compatibilityMode: "combine"
    }),
    /conflicts/
  );
});

test("rejects fractional and zero package capacities", () => {
  for (const value of [0, 1.5, -1, "5"]) {
    assert.throws(
      () => normalize({ maxUnitsPerPackage: value }),
      /positive integer/
    );
  }
});

test("rejects disabled protection for protected mode", () => {
  assert.throws(
    () => normalize({
      compatibilityMode: "protected",
      requiresProtection: false
    }),
    /requires protective packaging/
  );
});

test("rejects invalid protection and oversized flags", () => {
  assert.throws(
    () => normalize({ requiresProtection: "yes" }),
    /boolean/
  );
  assert.throws(
    () => normalize({ oversized: "true" }),
    /boolean/
  );
});