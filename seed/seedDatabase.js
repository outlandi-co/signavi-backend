import suppliers from "./suppliers.js"
import materialCatalog from "./materialCatalog.js"

console.log("\n📦 SIGNAVI MATERIAL CATALOG\n")

console.log(`Suppliers Loaded: ${suppliers.length}`)
console.log(`Materials Loaded: ${materialCatalog.length}`)

materialCatalog.forEach((material) => {
  console.log(
    `\n✅ ${material.fullName}`
  )

  console.log(
    `Colors: ${material.colors.length}`
  )

  console.log(
    `Price: $${material.price}`
  )

  console.log(
    `Supplier: ${material.source.vendor}`
  )
})

console.log("\n🎉 Catalog Ready For Database Import\n")