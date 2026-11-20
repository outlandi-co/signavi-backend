import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(
  new URL("./shippingPackingProfiles.js", import.meta.url),
  "utf8"
);

const normalized = route.replace(/\s+/g, " ");

test("draft validator resolves Studio product model", () => {
  assert.match(
    normalized,
    /resolveProductCatalogModel\("signavi_studio", \{/
  );

  assert.match(
    normalized,
    /isolatedModelResolver: getProductModelForChannel/
  );
});

test("draft validator requires Studio ownership fields", () => {
  assert.match(
    normalized,
    /StudioProductModel\.findOne\(\{ _id: preliminary\.data\.productId, storefront: "signavi_studio", salesChannel: "signavi_studio" \}\)\.lean\(\)/
  );

  assert.doesNotMatch(
    normalized,
    /Product\.findById\(preliminary\.data\.productId\)/
  );
});

test("profile creation remains disabled", () => {
  assert.match(
    normalized,
    /router\.post\("\/", async \(req, res\) => \{/
  );

  assert.match(
    normalized,
    /if \(!isolatedStudioProfilesEnabled\(\)\) \{ return res\.status\(503\)/
  );

  assert.match(
    normalized,
    /const ProfileModel = resolveAdminProfileModel\(\)/
  );

  assert.match(
    normalized,
    /active: false/
  );
});

test("draft validation does not save or activate", () => {
  assert.match(normalized, /saved: false/);
  assert.match(normalized, /activated: false/);
});