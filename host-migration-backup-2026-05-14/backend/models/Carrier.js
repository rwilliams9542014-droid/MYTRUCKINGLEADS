import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, uppercase: true, index: true, default: "" },
    zip: { type: String, trim: true, default: "" },
    raw: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const carrierSchema = new mongoose.Schema(
  {
    dotNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true
    },
    legalName: { type: String, trim: true, index: true, default: "" },
    dbaName: { type: String, trim: true, default: "" },
    address: { type: addressSchema, default: () => ({}) },
    phoneNumber: { type: String, trim: true, default: "" },
    cellPhone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    companyOfficer1: { type: String, trim: true, default: "" },
    companyOfficer2: { type: String, trim: true, default: "" },
    docketNumber: { type: String, trim: true, default: "" },
    safetyRating: { type: String, trim: true, default: "Unknown" },
    authorityStatus: { type: String, trim: true, index: true, default: "" },
    operatingStatus: { type: String, trim: true, default: "" },
    insuranceExpirationDate: { type: Date, index: true, default: null },
    insuranceEffectiveDate: { type: Date, default: null },
    insuranceCompany: { type: String, trim: true, default: "" },
    insurancePolicyNumber: { type: String, trim: true, default: "" },
    insuranceFormCode: { type: String, trim: true, default: "" },
    insuranceType: { type: String, trim: true, default: "" },
    fleetSize: { type: Number, min: 0, default: null },
    driverCount: { type: Number, min: 0, default: null },
    mcs150Date: { type: Date, default: null },
    mcs150Mileage: { type: Number, min: 0, default: null },
    cargoTypes: { type: [String], default: [] },
    dataCompletenessScore: { type: Number, min: 0, max: 100, default: 0 },
    enrichmentStatus: { type: String, trim: true, default: "pending", index: true },
    lastSaferEnrichedAt: { type: Date, default: null },
    lastSmsEnrichedAt: { type: Date, default: null },
    lastInsuranceEnrichedAt: { type: Date, default: null },
    lastFullEnrichedAt: { type: Date, index: true, default: null },
    dateCreated: { type: Date, index: true, default: null },
    lastUpdated: { type: Date, index: true, default: Date.now },
    isNewLead: { type: Boolean, index: true, default: true },
    newLeadSince: { type: Date, index: true, default: Date.now },
    source: { type: String, trim: true, default: "FMCSA" },
    sourceLastSeenAt: { type: Date, index: true, default: Date.now },
    raw: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    minimize: false
  }
);

carrierSchema.index({ "address.state": 1, authorityStatus: 1 });
carrierSchema.index({ insuranceExpirationDate: 1, authorityStatus: 1 });
carrierSchema.index({ insuranceExpirationDate: 1, fleetSize: -1 });
carrierSchema.index({ insuranceExpirationDate: 1, lastFullEnrichedAt: 1 });
carrierSchema.index({ fleetSize: -1, insuranceExpirationDate: 1 });
carrierSchema.index({ isNewLead: 1, newLeadSince: -1 });
carrierSchema.index({ isNewLead: 1, lastFullEnrichedAt: 1 });
carrierSchema.index({ "raw.census.add_date": -1 });
carrierSchema.index({ "raw.census.add_date": -1, "address.state": 1, fleetSize: -1 });
carrierSchema.index({ fleetSize: -1, "raw.census.add_date": -1 });
carrierSchema.index({ legalName: "text", dbaName: "text", dotNumber: "text" });

carrierSchema.virtual("carrierName").get(function carrierName() {
  return this.legalName || this.dbaName || "";
});

carrierSchema.set("toJSON", { virtuals: true });
carrierSchema.set("toObject", { virtuals: true });

export default mongoose.models.Carrier || mongoose.model("Carrier", carrierSchema);
