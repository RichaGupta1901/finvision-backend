const mongoose = require("mongoose");

// Define the schema for a single holding inside the array
const SingleHoldingSchema = new mongoose.Schema({
  symbol: String,
  isin: String,
  quantity: Number,
  avgPrice: Number,
  currentPrice: Number,
  investmentValue: Number,
  currentValue: Number,
  unrealizedGainLoss: Number,
  source: { type: String, default: "upload" }
}, { _id: false }); // Disable _id for subdocuments if not needed

// Main schema where all holdings are stored in one array per user
const HoldingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  email: { type: String, required: true },
  holdings: [SingleHoldingSchema],
  uploadedAt: { type: Date, default: Date.now }
});

// Optional: Indexes
HoldingSchema.index({ userId: 1 });
HoldingSchema.index({ email: 1 }); // Not unique anymore

module.exports = mongoose.model("Holding", HoldingSchema);