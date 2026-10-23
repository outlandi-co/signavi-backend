import ShippingPackage from "../models/ShippingPackage.js"
import { packVerifiedApparel } from "./smartShippingV3Packing.js"

export const calculateVerifiedApparelParcels = async ({
  quantity,
  unitWeightOz,
  packagingType = "mailer",
  shipSeparately = false,
  maxParcels = 100
}) => {
  const packages = await ShippingPackage.find({
    active: true,
    verifiedShirtCapacity: {
      $gte: 1
    }
  }).lean()

  return packVerifiedApparel({
    quantity,
    unitWeightOz,
    packagingType,
    shipSeparately,
    maxParcels,
    packages
  })
}