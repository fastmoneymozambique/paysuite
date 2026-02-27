const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURAÇÃO PAYSUITE ---
const API_TOKEN = "1546|AYQ8RP3a9hCT9BOfArr36tM8QwgFtMbYqlQ9cJPVf0a30f4e";
const WEBHOOK_SECRET = "whsec_7184a5b561e87ec3db0a23c402c8390cfdcb81bfc3a4dc1b";

// --- MIDDLEWARE ---
app.use(bodyParser.json());
app.use(cors());

// --- MONGODB ---
const MONGO_URI = "mongodb+srv://gogonegogone8_db_user:RA8De5K0v2KfdSBf@cluster0.kkwnihd.mongodb.net/kkr_credit_db?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB conectado"))
    .catch(err => console.log("Erro MongoDB:", err));

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
    number: { type: String, unique: true },
    password: String,
    plan: { type: String, default: "free" } // Free ou Pro
});

const paymentSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    amount: Number,
    reference: String,
    status: { type: String, default: "pending" },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Payment = mongoose.model("Payment", paymentSchema);

// --- ROTAS ---
// Cadastro
app.post("/signup", async (req, res) => {
    const { number, password } = req.body;
    if(!number || !password) return res.status(400).json({status:"error", message:"Preencha número e senha"});
    try {
        const hash = await bcrypt.hash(password, 10);
        const user = await User.create({ number, password: hash });
        res.json({status:"success", userId: user._id, plan: user.plan});
    } catch (err) {
        res.status(400).json({status:"error", message: "Número já cadastrado"});
    }
});

// Login
app.post("/login", async (req, res) => {
    const { number, password } = req.body;
    const user = await User.findOne({ number });
    if(!user) return res.status(400).json({status:"error", message:"Número não cadastrado"});
    const match = await bcrypt.compare(password, user.password);
    if(!match) return res.status(400).json({status:"error", message:"Senha incorreta"});
    res.json({status:"success", userId: user._id, plan: user.plan});
});

// Criar pagamento para upgrade de plano
app.post("/create_payment", async (req, res) => {
    const { userId, amount, reference } = req.body;
    if(!userId || !amount || !reference)
        return res.status(400).json({status:"error", message:"Dados incompletos"});

    try {
        // Cria payment request no PaySuite
        const response = await axios.post("https://paysuite.tech/api/v1/payments", {
            amount: Number(amount), // garante que é número
            reference,
            return_url: "https://successpaymoz.netlify.app/succes",
            callback_url: "https://paysuite.onrender.com/webhook"
        }, {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
                "Content-Type": "application/json",
                Accept: "application/json"
            }
        });

        const checkout_url = response.data.data.checkout_url;

        // Salva pagamento no Mongo
        await Payment.create({ userId, amount: Number(amount), reference, status: "pending" });

        res.json({status:"success", checkout_url});
    } catch (err) {
        console.error("Erro PaySuite:", err.response?.data || err.message);
        res.status(500).json({status:"error", message:"Erro ao criar pagamento", details: err.response?.data});
    }
});

// Webhook PaySuite
app.post("/webhook", async (req, res) => {
    const signature = req.headers["x-webhook-signature"];
    const payload = JSON.stringify(req.body);
    const calculatedSignature = crypto.createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");

    if(signature !== calculatedSignature){
        return res.status(403).json({status:"error", message:"Invalid signature"});
    }

    const event = req.body;
    const paymentId = event.data?.reference;
    const status = event.event === "payment.success" ? "paid" : "failed";

    // Atualiza status do pagamento
    const payment = await Payment.findOneAndUpdate({ reference: paymentId }, { status }, { new: true });

    // Se pagamento deu certo, sobe plano do usuário para Pro
    if(status === "paid" && payment){
        await User.findByIdAndUpdate(payment.userId, { plan: "pro" });
        console.log(`Usuário ${payment.userId} atualizado para plano PRO`);
    }

    res.json({status:"success"});
});

// --- START ---
app.listen(PORT, () => console.log(`Backend rodando em https://paysuite.onrender.com`));