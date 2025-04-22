require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");
const Papa = require("papaparse");
const Holding = require("./models/Holding");  // Your Holding model
const User = require("./models/User"); 
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth");
const app = express();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Save uploaded files to the "uploads" folder
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "_" + file.originalname); // Set a unique filename
  }
});
const session = require("express-session");
const MongoStore = require("connect-mongo");

const upload = multer({ storage });

app.use(helmet());
app.use(express.json());


// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  dbName: "finvision",
})
.then(() => console.log("🟢 MongoDB connected"))
.catch(err => console.error("🔴 MongoDB connection error:", err));

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB runtime error:", err);
});

app.use(cookieParser());

app.use(cors({
  origin: "http://localhost:3000",
  credentials: true,
}));

// Add below app.use(cors())
app.use(session({
  secret: process.env.SESSION_SECRET || 'supersecret', // 🔒 use .env for this
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, sameSite: "lax", maxAge: 24 * 60 * 60 * 1000 }, // 1 day
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    dbName: "finvision",
    collectionName: "sessions"
  })
}));

// Routes
app.use("/api/auth", authRoutes);
console.log("✅ Auth routes mounted");

// Base route
app.get("/", (req, res) => {
  res.send("FinVision Auth API is running.");
});


// ML Recommendation Route
app.post("/api/predict-stock", async (req, res) => {
  const { symbol } = req.body;

  try {
    const histRes = await axios.get("http://localhost:5000/api/historical", {
      params: { symbol }
    });

    const prices = histRes.data.map(p => parseFloat(p.price));
    const last3 = prices.slice(-3); // feature: last 3 hourly prices

    const predictionRes = await axios.post("http://localhost:6000/predict", {
      features: last3
    });

    res.json(predictionRes.data);
  } catch (err) {
    console.error("❌ Prediction error:", err.message);
    res.status(500).json({ error: "Prediction failed" });
  }
});

const portfolioRoutes = require("./routes/portfolio");
app.use("/api/portfolio", portfolioRoutes);

app.post("/api/portfolio/upload", upload.single("file"), async (req, res) => {
  const userEmail = req.headers["x-user-email"];  // Get the user's email from the request header
  
  if (!userEmail || !req.file) {
    return res.status(400).json({ message: "Email or file missing" });
  }

  try {
    // Parse CSV file using PapaParse
    const filePath = req.file.path;  // Path to the uploaded file

    // Parse the CSV file
    const fileData = await new Promise((resolve, reject) => {
      Papa.parse(filePath, {
        header: true, // Assuming the first row contains headers
        dynamicTyping: true,  // Automatically convert numbers
        complete: (results) => resolve(results.data),
        error: (error) => reject(error)
      });
    });

    // Log parsed data
    console.log("✅ Parsed CSV Data:", fileData);

    // Loop through the parsed data and create holdings records
    const holdings = fileData.map(item => ({
      symbol: item.symbol,
      isin: item.isin,
      quantity: item.quantity,
      avgPrice: item.avgPrice,
      currentPrice: item.currentPrice,
      investmentValue: item.investmentValue,
      currentValue: item.currentValue,
      unrealizedGainLoss: item.unrealizedGainLoss,
    }));

    // Assuming you have a userId field to link the portfolio
    const user = await User.findOne({ email: userEmail });  // Find the user by email

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Create or update holdings for the user
    await Holding.deleteMany({ userId: user._id });  // Optionally delete existing holdings before updating

    const createdHoldings = await Holding.insertMany(
      holdings.map(holding => ({ ...holding, userId: user._id }))
    );

    res.status(200).json({ message: "Holdings uploaded successfully", data: createdHoldings });
  } catch (err) {
    console.error("❌ Error processing the file:", err.message);
    res.status(500).json({ message: "Error uploading holdings", error: err.message });
  }
});

const upstoxRoutes = require("./routes/upstox");
app.use("/api/upstox", upstoxRoutes);
console.log("✅ Upstox route mounted");


// ✅ 404 fallback — keep this LAST
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
