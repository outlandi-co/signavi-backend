
import test from "node:test";
import assert from "node:assert/strict";
import Order from "../models/Order.js";

test("initialization owner is an explicit String schema path", () => {
  const path = Order.schema.path("v3SandboxInitializationOwner");

  assert.ok(path);
  assert.equal(path.instance, "String");
  assert.equal(path.options.default, "");
});

test("initialization revision is an explicit Number schema path", () => {
  const path = Order.schema.path("v3SandboxInitializationRevision");

  assert.ok(path);
  assert.equal(path.instance, "Number");
  assert.equal(path.options.default, 0);
  assert.equal(path.options.min, 0);
});

test("new orders begin without initialization ownership", () => {
  const order = new Order();

  assert.equal(order.v3SandboxInitializationOwner, "");
  assert.equal(order.v3SandboxInitializationRevision, 0);
});

test("existing checkout and payment schema fields remain present", () => {
  for (const field of [
    "paymentStatus",
    "squareEnvironment",
    "squareExpectedAmountCents",
    "squarePaymentId",
    "squarePaymentLinkId",
    "v3FirstAttemptProvenanceVersion",
    "v3FirstAttemptProvenanceIssuedAt"
  ]) {
    assert.ok(Order.schema.path(field), field);
  }
});
