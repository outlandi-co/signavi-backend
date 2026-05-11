import mongoose from "mongoose"

const digitalProductSchema = new mongoose.Schema(
  {
    previewImage: {
      type: String,
      default: ""
    },

    downloadFile: {
      type: String,
      default: ""
    },

    licenseType: {
      type: String,
      enum: [
        "personal-use",
        "small-business",
        "commercial",
        "extended-commercial",
        "exclusive"
      ],
      default: "personal-use"
    },

    dpi: {
      type: Number,
      default: 300
    },

    printSize: {
      type: String,
      default: ""
    },

    fileFormats: {
      type: [String],
      default: []
    },

    downloadLimit: {
      type: Number,
      default: 3
    },

    licenseRequired: {
      type: Boolean,
      default: true
    }
  },
  {
    _id: false
  }
)

export default digitalProductSchema