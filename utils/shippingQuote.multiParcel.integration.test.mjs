import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex");

const {
  createMultiParcelShippingQuote,
  verifyShippingQuote
} = await import("./shippingQuote.js");

const items = [{
  productId: "6afb9c92222951acaeec3db7",
  quantity: 5
}];

const destination = {
  street1: "123 Test Street",
  city: "Example City",
  state: "CA",
  zip: "90000",
  country: "US"
};

const rates = [
  {
    object_id: "synthetic-rate-1",
    amount: "5.25",
    currency: "USD",
    provider: "USPS",
    carrier_account: "synthetic-carrier-account",
    servicelevel: {
      token: "usps_priority",
      name: "Priority Mail"
    }
  },
  {
    object_id: "synthetic-rate-2",
    amount: "6.75",
    currency: "USD",
    provider: "USPS",
    carrier_account: "synthetic-carrier-account",
    servicelevel: {
      token: "usps_priority",
      name: "Priority Mail"
    }
  }
];

function makeQuote() {
  return createMultiParcelShippingQuote({
    items,
    destination,
    rates,
    testMode: true
  });
}

function verify(quote, options = {}) {
  return verifyShippingQuote(quote, {
    items,
    destination,
    allowTest: true,
    ...options
  });
}

test("creates and verifies a signed two-parcel quote", () => {
  const quote = makeQuote();
  const verified = verify(quote);

  assert.equal(typeof quote, "string");
  assert.equal(quote.split(".").length, 2);
  assert.equal(verified.amountCents, 1200);
  assert.equal(verified.testMode, true);

  assert.deepEqual(verified.rateIds, [
    "synthetic-rate-1",
    "synthetic-rate-2"
  ]);
});

test("rejects a changed cart", () => {
  const quote = makeQuote();

  assert.throws(() => verify(quote, {
    items: [{
      productId: items[0].productId,
      quantity: 6
    }]
  }), /Cart changed/);
});

test("rejects a changed shipping address", () => {
  const quote = makeQuote();

  assert.throws(() => verify(quote, {
    destination: {
      ...destination,
      zip: "90210"
    }
  }), /Shipping address changed/);
});

test("rejects a modified signature", () => {
  const quote = makeQuote();
  const [payload, signature] = quote.split(".");

  const changedSignature =
    (signature[0] === "A" ? "B" : "A") +
    signature.slice(1);

  assert.throws(() =>
    verify(`${payload}.${changedSignature}`)
  );
});

test("blocks test shipping rates from live payment", () => {
  const quote = makeQuote();

  assert.throws(() => verify(quote, {
    allowTest: false
  }), /Test shipping rates cannot be used/);
});

test("rejects mixed carrier accounts", () => {
  assert.throws(() =>
    createMultiParcelShippingQuote({
      items,
      destination,
      rates: [
        rates[0],
        {
          ...rates[1],
          carrier_account: "different-account"
        }
      ],
      testMode: true
    }),
    /same carrier service/
  );
});
