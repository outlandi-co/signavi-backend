quoteSchema.pre("save", function () {

  // Ensure timeline exists
  if (!this.timeline) this.timeline = []

  /* ================= APPROVED ================= */
  if (this.approvalStatus === "approved") {

    if (this.status !== "payment_required") {
      this.status = "payment_required"
      this.source = "order"

      this.timeline.push({
        status: "payment_required",
        date: new Date(),
        note: "Approved – awaiting payment"
      })
    }
  }

  /* ================= DENIED ================= */
  if (this.approvalStatus === "denied") {

    if (this.status !== "denied") {
      this.status = "denied"
      this.source = "quote"

      this.timeline.push({
        status: "denied",
        date: new Date(),
        note: this.denialReason || "Quote denied"
      })
    }
  }

})