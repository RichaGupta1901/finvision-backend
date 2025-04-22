from flask import Flask, request, jsonify
from sklearn.linear_model import SGDClassifier
from sklearn.preprocessing import StandardScaler
from collections import deque
import numpy as np
from flask_cors import CORS

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://localhost:3000"])

models = {}
scalers = {}
history = {}

WINDOW_SIZE = 10  # Number of past prices to consider

@app.route("/predict", methods=['POST'])
def predict():
    data = request.get_json()
    print("Received payload:", data)  # 👈 log request payload

    # Validate payload
    symbol = data.get("symbol")
    historical_data = data.get("historical")

    if not symbol or not isinstance(historical_data, list) or len(historical_data) < WINDOW_SIZE:
        return jsonify({"error": "Invalid input. 'symbol' and at least 10 data points in 'historical' are required."}), 400

    # ✅ Filter out entries where 'close' is None or the entry itself is None
    valid_data = [d for d in historical_data if isinstance(d, dict) and d.get("close") is not None]
    prices = [d["close"] for d in valid_data]

    if len(prices) < WINDOW_SIZE:
        return jsonify({"error": "Not enough valid data (non-null close prices) for prediction"}), 400

    # Initialize history deque if needed
    if symbol not in history:
        history[symbol] = deque(maxlen=WINDOW_SIZE)

    # Update price history
    history[symbol].clear()
    history[symbol].extend(prices[-WINDOW_SIZE:])  # Keep only the latest WINDOW_SIZE entries

    prices = list(history[symbol])
    print("Filtered and used historical prices:", prices)

    # Prepare features and labels
    X = np.array([[prices[i]] for i in range(WINDOW_SIZE - 1)])
    y = np.array([1 if prices[i + 1] > prices[i] else 0 for i in range(WINDOW_SIZE - 1)])
    latest_X = np.array([[prices[-2]]])

    # Initialize scaler/model if necessary
    if symbol not in scalers:
        scalers[symbol] = StandardScaler()
    if symbol not in models:
        models[symbol] = SGDClassifier(loss="log_loss")

    # Train and predict
    X_scaled = scalers[symbol].fit_transform(X)
    latest_X_scaled = scalers[symbol].transform(latest_X)
    models[symbol].partial_fit(X_scaled, y, classes=np.array([0, 1]))

    prob = models[symbol].predict_proba(latest_X_scaled)[0]
    trend = "Up" if prob[1] > 0.5 else "Down"
    confidence = round(prob[1] * 100 if trend == "Up" else prob[0] * 100, 2)

    return jsonify({"trend": trend, "confidence": confidence})

if __name__ == "__main__":
    app.run(port=5001, debug=True)
