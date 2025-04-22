const express = require("express");
const axios = require("axios");
const router = express.Router();
const qs = require("querystring"); // <-- Add this line here
require("dotenv").config();

const Holding = require("../models/Holding");
const User = require("../models/User");

const clientId = process.env.UPSTOX_CLIENT_ID;
const clientSecret = process.env.UPSTOX_CLIENT_SECRET;
const redirectUri = process.env.UPSTOX_REDIRECT_URI;

// Step 1: Start Upstox OAuth
router.get("/auth", (req, res) => {
  const user = req.session.user;
  if (!user || !user.email) {
    return res.status(401).json({ error: "User not logged in" });
  }

  const state = encodeURIComponent(user.email); // can also use JWT or sessionId if preferred

  const url = `https://api.upstox.com/v2/login/authorization/dialog?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&state=${state}`;
  res.redirect(url);
  console.log(req.query); // will show code/state or error
});

// Step 2: Handle callback
router.get("/callback", async (req, res) => {
  const { code, state } = req.query;
  const email = decodeURIComponent(state);

  if (!code || !email) return res.status(400).send("Invalid callback params");

  try {
    // Exchange code for token
    const tokenRes = await axios.post(
      "https://api.upstox.com/v2/login/authorization/token",
      qs.stringify({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    // Log the token response for debugging
    console.log("Token Response:", tokenRes.data);

    const access_token = tokenRes.data.access_token;
    if (!access_token) {
      return res.status(400).send("Failed to get access token");
    }

    // Log the access token for debugging
    console.log("Access Token:", access_token);

    // Get holdings using Upstox API
    const url = 'https://api.upstox.com/v2/portfolio/long-term-holdings';
    const headers = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${access_token}`
    };

    const holdingsRes = await axios.get(url, { headers });

    // Log the holdings response for debugging
    console.log("Holdings Response:", holdingsRes.data);

    const holdings = holdingsRes.data.data || [];

    const normalizedHoldings = holdings.map(h => ({
      symbol: h.trading_symbol,
      isin: h.isin,
      quantity: h.quantity,
      avgPrice: h.average_price,
      currentPrice: h.last_price,
      investmentValue: h.quantity * h.average_price,
      currentValue: h.quantity * h.last_price,
      unrealizedGainLoss: (h.last_price - h.average_price) * h.quantity,
      source: "upstox"
    }));

    const user = req.session.user;
    if (!user || user.email !== email) {
      return res.status(403).send("Session mismatch or user not found");
    }

    await Holding.findOneAndUpdate(
      { userId: user._id },
      {
        email,
        holdings: normalizedHoldings,
        uploadedAt: new Date()
      },
      { upsert: true, new: true }
    );

    req.session.user = {_id: user._id, email: user.email, name: user.name,};
    // ✅ Success redirect
    const successUrl = `http://localhost:3000/dashboard?${qs.stringify({
      import: "success"
    })}`;
    return res.redirect(successUrl);
  } catch (err) {
    let errorMsg = "Failed to fetch holdings from Upstox";

    if (err.response?.data?.status === "error") {
      const apiError = err.response.data.errors?.[0];
      if (apiError?.message) {
        errorMsg = apiError.message;
      }
    } else if (err.message) {
      errorMsg = err.message;
    }

    console.error("🔴 Full error:", err.response?.data || err.message);

    // ✅ Error redirect (URL-safe)
    const errorUrl = `http://localhost:3000/dashboard?${qs.stringify({
      importError: true,
      message: errorMsg
    })}`;
    // req.session.user = {_id: user._id, email: user.email, name: user.name,};
    return res.redirect(errorUrl);
  }
});

module.exports = router;
