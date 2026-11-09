import test from "node:test";
import assert from "node:assert/strict";

import {
  getSquareEnvironmentCredentials
} from "../utils/getSquareEnvironmentCredentials.js";

const keys = [
  "SQUARE_ENVIRONMENT",
  "SQUARE_SANDBOX_ACCESS_TOKEN",
  "SQUARE_SANDBOX_LOCATION_ID",
  "SQUARE_PRODUCTION_ACCESS_TOKEN",
  "SQUARE_PRODUCTION_LOCATION_ID"
];

function withSyntheticEnvironment(overrides, callback) {
  const original = Object.fromEntries(
    keys.map(key => [key, process.env[key]])
  );

  try {
    const synthetic = {
      SQUARE_ENVIRONMENT: "sandbox",
      SQUARE_SANDBOX_ACCESS_TOKEN: "SANDBOX_TEST_TOKEN",
      SQUARE_SANDBOX_LOCATION_ID: "SANDBOX_TEST_LOCATION",
      SQUARE_PRODUCTION_ACCESS_TOKEN: "PRODUCTION_TEST_TOKEN",
      SQUARE_PRODUCTION_LOCATION_ID: "PRODUCTION_TEST_LOCATION",
      ...overrides
    };

    for (const key of keys) {
      process.env[key] = synthetic[key] ?? "";
    }

    return callback();
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  }
}

test("sandbox selects sandbox credentials only", () => {
  withSyntheticEnvironment({}, () => {
    const config = getSquareEnvironmentCredentials();

    assert.equal(config.environment, "sandbox");
    assert.equal(config.accessToken, "SANDBOX_TEST_TOKEN");
    assert.equal(config.locationId, "SANDBOX_TEST_LOCATION");
  });
});

test("production selects production credentials only", () => {
  withSyntheticEnvironment({
    SQUARE_ENVIRONMENT: "production"
  }, () => {
    const config = getSquareEnvironmentCredentials();

    assert.equal(config.environment, "production");
    assert.equal(config.accessToken, "PRODUCTION_TEST_TOKEN");
    assert.equal(config.locationId, "PRODUCTION_TEST_LOCATION");
  });
});

test("missing sandbox token cannot fall back to production", () => {
  withSyntheticEnvironment({
    SQUARE_SANDBOX_ACCESS_TOKEN: ""
  }, () => {
    assert.throws(
      () => getSquareEnvironmentCredentials()
    );
  });
});

test("missing sandbox location cannot fall back to production", () => {
  withSyntheticEnvironment({
    SQUARE_SANDBOX_LOCATION_ID: ""
  }, () => {
    assert.throws(
      () => getSquareEnvironmentCredentials()
    );
  });
});

test("invalid Square environment fails closed", () => {
  withSyntheticEnvironment({
    SQUARE_ENVIRONMENT: "invalid"
  }, () => {
    assert.throws(
      () => getSquareEnvironmentCredentials()
    );
  });
});

test("missing production token fails closed", () => {
  withSyntheticEnvironment({
    SQUARE_ENVIRONMENT: "production",
    SQUARE_PRODUCTION_ACCESS_TOKEN: ""
  }, () => {
    assert.throws(
      () => getSquareEnvironmentCredentials()
    );
  });
});