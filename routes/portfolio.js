const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const csv = require("csvtojson");
const fs = require("fs");
const path = require("path");

const User = require("../models/User");
const Holding = require("../models/Holding");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// 🔧 Normalization helper
function normalizeHolding(rawRow) {
  const cleanedRow = {};
  for (const key in rawRow) {
    const cleanKey = key.trim().toLowerCase().replace(/\s+/g, ' '); // lowercase + trim + collapse spaces
    cleanedRow[cleanKey] = rawRow[key];
  }

  console.log("🧹 CleanedRow keys:", Object.keys(cleanedRow)); // Debug log
  const get = (...keys) => {
    for (const key of keys) {
      const cleanKey = key.trim().toLowerCase().replace(/\s+/g, ' ');
      if (cleanedRow[cleanKey] !== undefined && cleanedRow[cleanKey] !== "") {
        return cleanedRow[cleanKey];
      }
    }
    return null;
  };

  const normalized = {
    symbol: get("stock name", "scrip name", "symbol", "stock", "name") || "Unknown",
    isin: get("isin", "isin code") || "",
    quantity: parseFloat(get("quantity", "qty", "quantity held", "holdings")) || 0,
    avgPrice: parseFloat(get("average price", "avg price", "avg. cost", "average buy price")) || 0,
    currentPrice: parseFloat(get("current market price", "market price", "cmp", "current rate", "closing price")) || 0,
    investmentValue: parseFloat(get("investment value", "invested amount", "buy value")) || 0,
    currentValue: parseFloat(get("current value", "market value", "closing value")) || 0,
    unrealizedGainLoss: parseFloat(get("unrealized gain/loss", "p&l", "gain/loss", "unrealized p/l", "unrealised p&l")) || 0,
  };

  console.log("🧾 Normalized Row:", normalized); // Add this too
  return normalized;
}

// Add this function to detect the correct header row
function detectHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length); i++) {
    const row = rows[i].map(cell => String(cell).toLowerCase().trim());
    console.log("Checking row:", row); // Debugging log for row content

    // Check if row contains any of the potential column names (in any order)
    if (
      row.some(cell => cell.includes("stock name", "scrip name")) ||
      row.some(cell => cell.includes("isin")) ||
      row.some(cell => cell.includes("quantity")) ||
      row.some(cell => cell.includes("average buy price"))
    ) {
      return i; // Return the index of the header row
    }
  }
  return -1; // If no header row found
}

// 📥 Upload and parse holdings
router.post("/upload", upload.single("file"), async (req, res) => {
  console.log("📥 Upload endpoint hit");

  try {
    const email = req.headers["x-user-email"];
    if (!email) return res.status(400).json({ error: "Missing user email in header" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const userId = user._id;
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    let rawHoldings = [];

    if (ext === ".xlsx" || ext === ".xls") {
      const workbook = xlsx.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const allRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      const headerRowIndex = detectHeaderRow(allRows);
      if (headerRowIndex === -1) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: "Could not detect holdings table in Excel file" });
      }

      const relevantRows = allRows.slice(headerRowIndex);
      const sheetWithHeader = xlsx.utils.aoa_to_sheet(relevantRows);
      rawHoldings = xlsx.utils.sheet_to_json(sheetWithHeader, { defval: "" });
    }

    else if (ext === ".csv") {
      const allText = fs.readFileSync(filePath, "utf8");
      const lines = allText.split("\n").map(line => line.split(","));
      const headerRowIndex = detectHeaderRow(lines);
      if (headerRowIndex === -1) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: "Could not detect holdings table in CSV file" });
      }

      const relevantCsv = lines.slice(headerRowIndex).map(row => row.join(",")).join("\n");
      fs.writeFileSync(filePath, relevantCsv);
      rawHoldings = await csv().fromFile(filePath);
    }

    else {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: "Unsupported file format" });
    }

    fs.unlinkSync(filePath); // Cleanup

    // Filter and normalize
    rawHoldings = rawHoldings.filter(row =>
      (row["Scrip Name"] || row["Stock Name"] || row["Scrip"] || row["Symbol"] || row["Name"]) &&
      parseFloat(row["Quantity Held"] || row["Quantity"] || row["Qty"] || row["Holdings"]) > 0
    );

    const normalizedHoldings = rawHoldings.map(row => normalizeHolding(row));

    console.log("📦 Final normalized holdings:", normalizedHoldings.length);
    console.dir(normalizedHoldings.slice(0, 2), { depth: null });

    const result = await Holding.findOneAndUpdate(
      { userId },
      {
        userId,
        email,
        holdings: normalizedHoldings,
        uploadedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      message: "Holdings uploaded successfully",
      data: result,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});



// 📤 Get holdings for a user
router.get("/holdings", async (req, res) => {
  try {
    const email = req.headers["x-user-email"];
    if (!email) return res.status(400).json({ error: "Missing user email" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const userHoldings = await Holding.findOne({ userId: user._id });

    if (!userHoldings) {
      return res.status(200).json({
        message: "No holdings found",
        holdings: [],
        uploadedAt: null,
      });
    }

    res.status(200).json({
      message: "Holdings retrieved successfully",
      holdings: userHoldings.holdings,
      uploadedAt: userHoldings.uploadedAt,
      email: userHoldings.email,
    });
  } catch (err) {
    console.error("Get holdings error:", err);
    res.status(500).json({ error: "Failed to retrieve holdings" });
  }
});

module.exports = router;
