const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const logger = require("../utils/logger");

const router = express.Router();

// Signup route
router.post("/signup", async (req, res) => {
  const { email, pin } = req.body;

  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "User already exists" });

    let hashedPin = "";
    if (pin) {
      if (!/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: "PIN must be a 4-digit number" });
      }
      hashedPin = await bcrypt.hash(pin, 10);
    }

    const user = new User({ email, pin: hashedPin || undefined });
    await user.save();

    res.status(201).json({ message: "Signup successful" });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Login route
router.post("/login", async (req, res) => {
  const { email, pin } = req.body;
  console.log("🔐 Session at login:", req.session);

  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "User not found" });

    // If user signed up via Google, no PIN required
    if (!user.pin && !pin) {
      return res.status(200).json({ message: "Google login successful", user });
    }

    if (!pin) return res.status(400).json({ error: "PIN is required" });

    const isMatch = await bcrypt.compare(pin, user.pin);
    if (!isMatch) return res.status(401).json({ error: "Incorrect PIN" });

    req.session.user = { _id: user._id, email: user.email, name: user.name }; // ✅ set session
    res.status(200).json({ message: "Login successful", user: req.session.user });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login error" });
  }
  logger.info(`Login attempt by ${email}`);
});

// saveUser route for Google-authenticated users
router.post("/saveUser", async (req, res) => {
  const { email, name, uid } = req.body;
  console.log("🔔 /saveUser route hit");

  try {
    // Check if user already exists (by email or uid)
    let user = await User.findOne({ email });

    if (!user) {
      user = new User({ email,name, uid });
      await user.save();
    }

    console.log("🔍 req.session before setting:", req.session);
    // ✅ Set session info for Google-authenticated user
    req.session.user = { _id: uid, email: email, name: name };

    res.status(200).json({ message: "User saved successfully" });
  } catch (error) {
    console.error("Error saving Google user:", error);
    res.status(500).json({ message: "Server error saving user" });
  }
});

router.get("/check-session", (req, res) => {
  if (req.session.user) {
    res.json({ authenticated: true, user: req.session.user });
    console.log("🔎 Session at check:", req.session);
  } else {
    res.status(401).json({ authenticated: false });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ message: "Logout failed" });
    res.clearCookie("connect.sid"); // remove cookie
    res.status(200).json({ message: "Logged out successfully" });
    logger.info(`User ${req.session.user?.email} logged out`);
  });
});

router.get("/me", (req, res) => {
  if (req.session.user) {
    return res.status(200).json({ user: req.session.user });
  }
  return res.status(401).json({ message: "Not logged in" });
});

module.exports = router;
