import test from "node:test";
import assert from "node:assert/strict";

import {
  mapV3TrustedCheckoutHttpResult as map
} from "../utils/v3TrustedCheckoutHttpResult.js";

const recorded = paymentUrl => ({
  status: "link_recorded",
  reason: "PAYMENT_LINK_DURABLY_RECORDED",
  retryAuthorized: false,
  paymentUrl
});

test("missing result fails closed", () => {
  assert.equal(map(null).httpStatus, 423);
});

test("prepared state cannot redirect", () => {
  assert.equal(
    map({
      ready: true,
      persistedAndVerified: true,
      squareRequestAuthorized: false
    }).httpStatus,
    423
  );
});

test("approved Square URL maps to HTTP 200", () => {
  const url = "https://square.link/u/test";

  const result = map(recorded(url));

  assert.equal(result.httpStatus, 200);
  assert.equal(result.body.paymentUrl, url);
});

test("approved sandbox URL maps to HTTP 200", () => {
  assert.equal(
    map(recorded("https://sandbox.square.link/u/test"))
      .httpStatus,
    200
  );
});

test("approved Square checkout site maps to HTTP 200", () => {
  assert.equal(
    map(recorded("https://checkout.square.site/pay/test"))
      .httpStatus,
    200
  );
});

test("unverified result cannot redirect", () => {
  assert.equal(
    map({
      status: "link_recorded",
      paymentUrl: "https://square.link/u/test"
    }).httpStatus,
    423
  );
});

const rejectedUrls = [
  "https://example.com/pay",
  "http://square.link/u/test",
  "https://square.link.evil.example/u/test",
  "https://fake-square.link/u/test",
  "https://user:secret@square.link/u/test",
  "https://square.link:8443/u/test",
  "https://square.link/u/test#fragment",
  "https://square.link/",
  "https://square.link",
  "https://square.link/u/test ",
  "javascript:alert(1)",
  "not-a-url",
  ""
];

for (const url of rejectedUrls) {
  test(`reject unapproved URL: ${url || "(empty)"}`, () => {
    const result = map(recorded(url));

    assert.equal(result.httpStatus, 423);
    assert.equal(result.body.success, false);
    assert.equal(result.body.retryAuthorized, false);
    assert.equal(result.body.reason, "UNAPPROVED_PAYMENT_URL");
  });
}

test("missing payment URL fails closed", () => {
  assert.equal(
    map(recorded(undefined)).httpStatus,
    423
  );
});

test("retry permission is rejected", () => {
  const result = {
    ...recorded("https://square.link/u/test"),
    retryAuthorized: true
  };

  assert.equal(map(result).httpStatus, 423);
});