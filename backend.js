// backend.js
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const fs = require("fs");

const app = express();
const PORT = 3000;

// --- CONFIG ---
const API_TOKEN = "1546|AYQ8RP3a9hCT9BOfArr36tM8QwgFtMbYqlQ9cJPVf0a30f4e";
const WEBHOOK_SECRET = "whsec_7184a5b561e87ec3db0a23c402c8390cfdcb81bfc3a4dc1b";

// --- MIDDLEWARE ---
app.use(bodyParser.json());

// --- Criar Payment Request ---
app.post("/create_payment", async (req, res) => {
    const data = {
        amount: req.body.amount || 100.50,
        reference: req.body.reference || "TEST123",
        description: req.body.description || "Pagamento teste",
        return_url: req.body.return_url || "https://example.com/success",
        callback_url: req.body.callback_url || `http://localhost:${PORT}/webhook`
    };

    try {
        const response = await axios.post("https://paysuite.tech/api/v1/payments", data, {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
                "Content-Type": "application/json",
                Accept: "application/json"
            }
        });
        res.json(response.data);
    } catch (err) {
        res.status(err.response?.status || 500).json(err.response?.data || {status:"error", message:"Erro interno"});
    }
});

// --- Webhook Receiver ---
app.post("/webhook", (req, res) => {
    const signature = req.headers["x-webhook-signature"];
    const payload = JSON.stringify(req.body);
    const calculatedSignature = crypto.createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");

    if (signature !== calculatedSignature) {
        return res.status(403).json({status:"error", message:"Invalid signature"});
    }

    fs.appendFileSync("webhook_log.json", payload + "\n");
    res.json({status:"success"});
});

app.listen(PORT, () => console.log(`Backend rodando em http://localhost:${PORT}`));
