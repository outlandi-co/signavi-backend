import test from "node:test";
import assert from "node:assert/strict";
import { combineParcelRates } from "./shipping.js";

function rate(id, amount, overrides = {}) {
  return {
    object_id: id,
    provider: "USPS",
    carrier_account: "test-carrier-account",
    servicelevel: { token: "usps_priority" },
    amount,
    currency: "USD",
    ...overrides
  };
}

test("combines matching rates for two parcels", () => {
  const result = combineParcelRates([
    { rates: [rate("rate-1", "5.25")] },
    { rates: [rate("rate-2", "6.75")] }
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].amount, "12.00");
  assert.deepEqual(result[0].parcelRateIds, [
    "rate-1",
    "rate-2"
  ]);
});

test("rejects services missing from a parcel", () => {
  const result = combineParcelRates([
    { rates: [rate("rate-1", "5.25")] },
    { rates: [] }
  ]);

  assert.deepEqual(result, []);
});

test("rejects mismatched services", () => {
  const result = combineParcelRates([
    { rates: [rate("rate-1", "5.25")] },
    {
      rates: [
        rate("rate-2", "6.75", {
          servicelevel: { token: "usps_ground" }
        })
      ]
    }
  ]);

  assert.deepEqual(result, []);
});

test("rejects invalid currency and amount", () => {
  const result = combineParcelRates([
    {
      rates: [
        rate("invalid-currency", "5.25", {
          currency: "EUR"
        }),
        rate("invalid-price", "-1.00"),
        rate("valid-rate", "7.00")
      ]
    },
    { rates: [rate("second-rate", "6.00")] }
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].amount, "13.00");
});

test("sorts combined shipping rates by price", () => {
  const ground = (id, amount) =>
    rate(id, amount, {
      servicelevel: { token: "usps_ground" }
    });

  const result = combineParcelRates([
    {
      rates: [
        rate("priority-1", "10.00"),
        ground("ground-1", "4.00")
      ]
    },
    {
      rates: [
        rate("priority-2", "12.00"),
        ground("ground-2", "5.00")
      ]
    }
  ]);

  assert.deepEqual(
    result.map(item => item.amount),
    ["9.00", "22.00"]
  );
});
