# from flask import Flask, request, jsonify
# from sklearn.linear_model import SGDClassifier
# from sklearn.preprocessing import StandardScaler
# import numpy as np
# import joblib
# import os

# app = Flask(__name__)

# MODEL_PATH = "model.pkl"
# SCALER_PATH = "scaler.pkl"

# # Load model if exists, else initialize
# if os.path.exists(MODEL_PATH):
#     model = joblib.load(MODEL_PATH)
#     print("✅ Model loaded")
# else:
#     model = SGDClassifier(loss="log_loss")  # for binary classification

# # Load or initialize scaler
# if os.path.exists(SCALER_PATH):
#     scaler = joblib.load(SCALER_PATH)
# else:
#     scaler = StandardScaler()

# @app.route("/train", methods=["POST"])
# def train():
#     data = request.json
#     features = np.array(data["features"]).reshape(1, -1)
#     label = data["label"]  # 0 or 1

#     scaled = scaler.partial_fit(features).transform(features)
#     model.partial_fit(scaled, [label], classes=[0, 1])

#     joblib.dump(model, MODEL_PATH)
#     joblib.dump(scaler, SCALER_PATH)

#     return jsonify({"status": "trained"})

# @app.route("/predict", methods=["POST"])
# def predict():
#     data = request.json
#     features = np.array(data["features"]).reshape(1, -1)
#     scaled = scaler.transform(features)

#     prob = model.predict_proba(scaled)[0][1]  # probability of class 1
#     decision = "RECOMMEND" if prob > 0.6 else "AVOID"

#     return jsonify({"probability": prob, "decision": decision})

# if __name__ == "__main__":
#     app.run(port=6000)
