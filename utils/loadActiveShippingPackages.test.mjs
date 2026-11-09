import test from "node:test"
import assert from "node:assert/strict"
import {
  loadActiveShippingPackages
} from "./loadActiveShippingPackages.mjs"

const sample = {
  _id: "507f1f77bcf86cd799439011",
  name: "Test Apparel Box",
  type: "box",
  lengthIn: 16,
  widthIn: 12,
  heightIn: 6,
  tareWeightOz: 4,
  maxWeightOz: 64,
  clearanceIn: 0,
  active: true
}

function mockModel(records) {
  let filter

  return {
    get filter() {
      return filter
    },
    find(query) {
      filter = query

      return {
        async lean() {
          return records
        }
      }
    }
  }
}

test("reads active packages and normalizes fields", async () => {
  const model = mockModel([sample])
  const result = await loadActiveShippingPackages(model)

  assert.deepEqual(model.filter, { active: true })
  assert.equal(result.length, 1)
  assert.equal(result[0].id, sample._id)
  assert.equal(result[0].maxWeight, 64)
})

test("rejects inactive records even if returned by model", async () => {
  const result = await loadActiveShippingPackages(
    mockModel([{ ...sample, active: false }])
  )

  assert.deepEqual(result, [])
})

test("empty catalog does not generate artificial packages", async () => {
  const result = await loadActiveShippingPackages(
    mockModel([])
  )

  assert.deepEqual(result, [])
})

test("missing model fails closed", async () => {
  await assert.rejects(
    loadActiveShippingPackages(null),
    /SHIPPING_PACKAGE_MODEL_UNAVAILABLE/
  )
})

test("database errors fail closed", async () => {
  const model = {
    find() {
      return {
        async lean() {
          throw new Error("DATABASE_UNAVAILABLE")
        }
      }
    }
  }

  await assert.rejects(
    loadActiveShippingPackages(model),
    /DATABASE_UNAVAILABLE/
  )
})

test("unexpected database result fails closed", async () => {
  await assert.rejects(
    loadActiveShippingPackages(mockModel(null)),
    /SHIPPING_PACKAGE_CATALOG_UNAVAILABLE/
  )
})
