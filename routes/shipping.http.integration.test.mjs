import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import shippingRouter from "./shipping.js";

test("shipping HTTP validation rejects incomplete address", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/shipping", shippingRouter);

  const server = await new Promise(resolve => {
    const instance = app.listen(0, "127.0.0.1", () =>
      resolve(instance)
    );
  });

  try {
    const port = server.address().port;

    const response = await fetch(
      `http://127.0.0.1:${port}/api/shipping/get-rates`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          storefront: "signavi_studio",
          items: [{
            productId: "6afb9c92222951acaeec3db7",
            quantity: 1
          }],
          address_to: {}
        })
      }
    );

    assert.equal(response.status, 400);

    const body = await response.json();

    assert.match(
      body.message,
      /complete shipping address/i
    );
  } finally {
    await new Promise(resolve =>
      server.close(resolve)
    );
  }
});


test("shipping HTTP validation rejects invalid storefront", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/shipping", shippingRouter);

  const server = await new Promise(resolve => {
    const instance = app.listen(0, "127.0.0.1", () =>
      resolve(instance)
    );
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/shipping/get-rates`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storefront: "invalid_storefront",
          items: [{
            productId: "6afb9c92222951acaeec3db7",
            quantity: 1
          }],
          address_to: {}
        })
      }
    );

    assert.equal(response.status, 400);

    const body = await response.json();
    assert.equal(body.success, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

import { mock } from "node:test";
import axios from "axios";
import Product from "../models/Product.js";
import ShippingPackage from "../models/ShippingPackage.js";
import ShippingProductPackageProfile from "../models/ShippingProductPackageProfile.js";


test("inactive Studio profile returns HTTP 422 without Shippo", async () => {
  const keys = [
    "NODE_ENV",
    "SIGNAVI_PRODUCT_DATABASE_ISOLATION",
    "SIGNAVI_SHIPPING_PROFILE_ISOLATION",
    "SHIPPO_CUSTOMER_RATE_MODE",
    "SHIPPO_API_KEY",
    "SHIP_FROM_NAME",
    "SHIP_FROM_STREET1",
    "SHIP_FROM_CITY",
    "SHIP_FROM_STATE",
    "SHIP_FROM_ZIP",
    "SHIP_FROM_COUNTRY"
  ];

  const previous = Object.fromEntries(
    keys.map(key => [key, process.env[key]])
  );

  let server;
  let shippoCalls = 0;
  let profileQueries = 0;

  const productId = "507f1f77bcf86cd799439011";
  const packageId = "507f1f77bcf86cd799439012";

  try {
    Object.assign(process.env, {
      NODE_ENV: "test",
      SIGNAVI_PRODUCT_DATABASE_ISOLATION: "false",
      SIGNAVI_SHIPPING_PROFILE_ISOLATION: "false",
      SHIPPO_CUSTOMER_RATE_MODE: "off",
      SHIPPO_API_KEY: "shippo_test_synthetic_never_used",
      SHIP_FROM_NAME: "Test Sender",
      SHIP_FROM_STREET1: "100 Test Street",
      SHIP_FROM_CITY: "Example City",
      SHIP_FROM_STATE: "CA",
      SHIP_FROM_ZIP: "90000",
      SHIP_FROM_COUNTRY: "US"
    });

    mock.method(ShippingPackage, "find", filter => {
      assert.equal(filter.active, true);

      return {
        async lean() {
          return [{
            _id: packageId,
            name: "Synthetic Shipping Box",
            type: "box",
            carrier: "Generic",
            lengthIn: 12,
            widthIn: 10,
            heightIn: 4,
            tareWeightOz: 2,
            maxWeightOz: 50,
            clearanceIn: 0.5,
            uspsFlatRate: false,
            active: true
          }];
        }
      };
    });

    mock.method(Product, "find", filter => {
      assert.equal(filter.storefront, "signavi_studio");

      return {
        select() {
          return this;
        },
        async lean() {
          return [{
            _id: productId,
            storefront: "signavi_studio",
            salesChannel: "signavi_studio",
            productType: "physical",
            active: true,
            storefrontVisible: true,
            shipping: {
              mode: "saved_package",
              packageId,
              packagingType: "box",
              shipSeparately: false
            }
          }];
        }
      };
    });

    mock.method(ShippingProductPackageProfile, "find", filter => {
      profileQueries++;

      assert.equal(String(filter.packageId), packageId);
      assert.equal(filter.active, true);

      // An inactive profile is excluded by this authoritative query.
      return {
        select() {
          return this;
        },
        async lean() {
          return [];
        }
      };
    });

    mock.method(axios, "post", async () => {
      shippoCalls++;
      throw new Error("UNEXPECTED_SHIPPO_REQUEST");
    });

    const app = express();
    app.use(express.json());
    app.use("/api/shipping", shippingRouter);

    server = await new Promise(resolve => {
      const instance = app.listen(0, "127.0.0.1", () =>
        resolve(instance)
      );
    });

    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/shipping/get-rates`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storefront: "signavi_studio",
          items: [{ productId, quantity: 5 }],
          address_to: {
            name: "Test Recipient",
            street1: "123 Test Street",
            city: "Example City",
            state: "CA",
            zip: "90000",
            country: "US"
          }
        })
      }
    );

    const body = await response.json();

    assert.equal(response.status, 422, JSON.stringify(body));
    assert.equal(body.success, false);
    assert.match(
      body.message,
      /unique active verified packing profile is required/i
    );

    assert.equal(profileQueries, 1);
    assert.equal(shippoCalls, 0);

    console.log("INACTIVE_STUDIO_PROFILE_HTTP_422_VERIFIED");
    console.log("SHIPPO_REQUEST_COUNT_ZERO");
  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }

    mock.restoreAll();

    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
});
