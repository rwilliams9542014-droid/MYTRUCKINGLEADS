import mongoose from "mongoose";

const carrierChangeSchema = new mongoose.Schema(
  {
    dotNumber: { type: String, required: true, trim: true, index: true },
    carrier: { type: mongoose.Schema.Types.ObjectId, ref: "Carrier", index: true },
    field: { type: String, required: true, trim: true, index: true },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    source: { type: String, trim: true, default: "FMCSA" },
    importRunId: { type: String, trim: true, index: true, default: "" },
    changedAt: { type: Date, index: true, default: Date.now }
  },
  { timestamps: true }
);

carrierChangeSchema.index({ dotNumber: 1, changedAt: -1 });
carrierChangeSchema.index({ field: 1, changedAt: -1 });

export default mongoose.models.CarrierChange || mongoose.model("CarrierChange", carrierChangeSchema);
