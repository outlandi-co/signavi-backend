import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import ShippingProductPackageProfile from "../models/ShippingProductPackageProfile.js";

import Product from "../models/Product.js";
import { getProductModelForChannel } from "../models/productModelSelection.js";
import { resolveProductCatalogModel } from "../services/resolveProductCatalogModel.js";
import ShippingPackage from "../models/ShippingPackage.js";
import {
  validatePackingProfileCreation
} from "../utils/validatePackingProfileCreation.mjs";
import {
  preparePackingProfileDraft
} from "../utils/preparePackingProfileDraft.mjs";

import {
  assessPackingProfileActivation
} from "../utils/assessPackingProfileActivation.mjs";
import {
  validatePackingProfileRelationship
} from "../utils/validatePackingProfileRelationship.mjs";
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
router.get("/:profileId/activation-review", async (req, res) => {
  const { profileId } = req.params;

  if (!/^[a-f0-9]{24}$/i.test(profileId)) {
    return res.status(400).json({
      success: false,
      message: "Valid packing profile ID is required"
    });
  }

  try {
    const profile = await ShippingProductPackageProfile
      .findById(profileId)
      .select(
        "productId packageId unitWeightOz verifiedCapacity " +
        "verifiedBy verifiedAt verificationNotes active"
      )
      .lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Packing profile not found"
      });
    }

    const StudioProductModel = resolveProductCatalogModel("signavi_studio", {
      enabled: true,
      legacyModel: Product,
      isolatedModelResolver: getProductModelForChannel
    });

    const [product, shippingPackage] = await Promise.all([
      StudioProductModel.findOne({
        _id: profile.productId,
        storefront: "signavi_studio",
        salesChannel: "signavi_studio"
      }).lean(),
      ShippingPackage.findById(profile.packageId).lean()
    ]);

    const relationship = validatePackingProfileRelationship({
      product,
      shippingPackage,
      expectedStorefront: "signavi_studio"
    });

    const identifiersMatch =
      relationship.valid === true &&
      String(profile.productId).toLowerCase() === relationship.productId &&
      String(profile.packageId).toLowerCase() === relationship.packageId;

    const assessment = assessPackingProfileActivation({
      profile,
      evidence: {}
    });

    if (!identifiersMatch) {
      return res.status(422).json({
        success: false,
        message: relationship.valid
          ? "Packing profile identifiers do not match"
          : relationship.error,
        ownershipVerified: false,
        assessment: {
          ...assessment,
          eligibleForFurtherReview: false,
          mayActivateProfile: false,
          mayExecutePayment: false
        }
      });
    }

    return res.status(200).json({
      success: true,
      profileId,
      productId: profile.productId,
      packageId: profile.packageId,
      ownershipVerified: true,
      assessment
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to review packing profile"
    });
  }
});
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
    const StudioProductModel = resolveProductCatalogModel("signavi_studio", {
      legacyModel: Product,
      isolatedModelResolver: getProductModelForChannel
    });

    const [product, shippingPackage] = await Promise.all([
      StudioProductModel.findOne({
        _id: preliminary.data.productId,
        storefront: "signavi_studio",
        salesChannel: "signavi_studio"
      }).lean(),
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
