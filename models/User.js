const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  pin: { type: String }, // Only for manual login
  uid: { type: String }, // Firebase UID (only for Google login)
  demat: { type: String }, // Optional for Google users initially
  createdAt: { type: Date, default: Date.now }
});

// You can also add an index for better lookups if needed
userSchema.index({ email: 1 });

module.exports = mongoose.model("User", userSchema);
