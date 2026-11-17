import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import ShippingProductPackageProfile from "../models/ShippingProductPackageProfile.js";

import Product from "../models/Product.js";
import ShippingPackage from "../models/ShippingPackage.js";
import {
  validatePackingProfileCreation
} from "../utils/validatePackingProfileCreation.mjs";
import {
  preparePackingProfileDraft
} from "../utils/preparePackingProfileDraft.mjs";

const router = express.Router();

// All profile operations require an authenticated administrator.
router.use(requireAuth);
router.use(requireAdmin);

// Read-only profile inventory.
// Activation and creation are intentionally not implemented yet.
router.get("/", async (req, res) => {
  try {
    const profiles = await ShippingProductPackageProfile
      .find({})
      .select(
        "productId packageId unitWeightOz verifiedCapacity " +
        "verifiedBy verifiedAt verificationNotes active"
      )
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: profiles.length,
      data: profiles
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve packing profiles"
    });
  }
});

// Fail closed until authenticated write validation,
// database index verification, and isolated tests are complete.
// Administrator-only validation; no database writes.
router.post("/validate-draft", async (req, res) => {
  const input = req.body;

  const preliminary = validatePackingProfileCreation(input);

  if (!preliminary.valid) {
    return res.status(400).json({
      success: false,
      message: preliminary.error
    });
  }

  try {
    const [product, shippingPackage] = await Promise.all([
      Product.findById(preliminary.data.productId).lean(),
      ShippingPackage.findById(preliminary.data.packageId).lean()
    ]);

    if (!product || !shippingPackage) {
      return res.status(404).json({
        success: false,
        message: "Product or shipping package not found"
      });
    }

    const result = preparePackingProfileDraft({
      input,
      product,
      shippingPackage
    });

    if (!result.valid) {
      return res.status(422).json({
        success: false,
        message: result.error
      });
    }

    return res.status(200).json({
      success: true,
      valid: true,
      saved: false,
      activated: false,
      storefront: result.storefront,
      draft: result.data
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to validate packing profile"
    });
  }
});

router.post("/", (_req, res) => {
  return res.status(503).json({
    success: false,
    message: "Packing profile creation is not enabled"
  });
});

export default router;
