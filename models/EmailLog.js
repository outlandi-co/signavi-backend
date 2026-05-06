import mongoose from "mongoose"

const emailLogSchema = new mongoose.Schema(

  {
    /* ================= RECIPIENTS ================= */

    to: {
      type: String,
      required: true,
      trim: true
    },

    cc: {
      type: String,
      default: "",
      trim: true
    },

    /* ================= CONTENT ================= */

    subject: {
      type: String,
      required: true,
      trim: true
    },

    message: {
      type: String,
      required: true
    },

    /* ================= STATUS ================= */

    status: {
      type: String,

      enum: [
        "sent",
        "failed",
        "draft",
        "archived"
      ],

      default: "sent"
    },

    archived: {
      type: Boolean,
      default: false
    },

    /* ================= ADMIN ================= */

    sentBy: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: false
    },

    adminEmail: {
      type: String,
      default: ""
    },

    /* ================= CUSTOMER ================= */

    customerId: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: false
    },

    customerName: {
      type: String,
      default: ""
    }

  },

  {
    timestamps: true
  }
)

const EmailLog =
  mongoose.model(
    "EmailLog",
    emailLogSchema
  )

export default EmailLog