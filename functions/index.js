

// ─── Imports & Initialization ─────────────────────────────────────────────────
const functions = require("firebase-functions");                     // for functions.config()
const { onRequest } = require("firebase-functions/v2/https");       // v2 HTTPS
const express        = require("express");
const cors           = require("cors");
const admin          = require("firebase-admin");

// Read config from functions.config()
//   emulator will load your .runtimeconfig.json
const config   = functions.config();
const stripe   = require("stripe")(config.stripe.secret_key);
const sgMail   = require("@sendgrid/mail");
const WEBHOOK_SECRET = config.stripe.webhook_secret || "";          

admin.initializeApp();
sgMail.setApiKey(config.sendgrid.api_key);

// ─── Express setup ────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: true }));
app.options("*", cors({ origin: true }));
app.use(express.json());

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function updateStock(items) {
  const db = admin.firestore();
  await db.runTransaction(async txn => {
    const refs = items.map(i => ({
      ref: db.collection("products").doc(i.id),
      qty: parseInt(i.quantity, 10)
    }));
    const snaps = await Promise.all(refs.map(r => txn.get(r.ref)));
    const errors = snaps
      .map((snap, i) => {
        if (!snap.exists)                                   return `Missing ${refs[i].ref.id}`;
        if ((snap.data().stock||0) < refs[i].qty)            return `Insufficient stock for ${snap.id}`;
        return null;
      })
      .filter(e => e);
    if (errors.length) throw new Error(errors.join(", "));
    snaps.forEach((snap, i) => {
      const newStock = Math.max(0, (snap.data().stock||0) - refs[i].qty);
      txn.update(refs[i].ref, {
        stock: newStock,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
    });
  });
}

async function sendOrderConfirmationEmail(data) {
  const msg = {
    to:   data.email,
    from: "info@justenjoyibiza.com",
    templateId: "d-519fbb63105146899cbd444ef8ff60a9",
    dynamic_template_data: {
      customer_name: data.fullName,
      boat_name:     data.boatName,
      order_date:    data.orderDate,
      phone_number:  data.phoneNumber,
      special_notes: data.specialNotes,
      boat_location: data.boatLocation || "Not specified",
      total_price:   data.totalPrice,
      items:         data.items,
      track_link:    `https://your-site.com/track-order/${data.orderId}`
    }
  };
  await sgMail.send(msg);
}

// Shared checkout logic
async function handleCheckout(req, res) {
  try {
    const {
      cart, boatName, orderDate,
      customerEmail, email: rawEmail,
      fullName, rentalCompany,
      phoneNumber, specialNotes,
      paymentMethod, boatLocation
    } = req.body;

    const finalEmail = customerEmail || rawEmail;
    if (!Array.isArray(cart) || !cart.length || !finalEmail) {
      return res.status(400).json({ error: "Invalid cart or missing email" });
    }

    // build line items for Stripe
    const line_items = cart.map(item => ({
      price_data: {
        currency:     "eur",
        product_data: { name: item.name },
        unit_amount:  Math.round(item.price * 100)
      },
      quantity: item.quantity
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email:       finalEmail,
      line_items,
      mode:                 "payment",
      success_url:          `${req.headers.origin}/success.html`,
      cancel_url:           `${req.headers.origin}/services.html`,
      metadata: {
        orderId:       Date.now().toString(),
        boatName,
        orderDate,
        customerEmail: finalEmail,
        fullName,
        rentalCompany,
        phoneNumber,
        specialNotes,
        paymentMethod,
        boatLocation:  boatLocation||"",
        cart:          JSON.stringify(cart)
      }
    });

    return res.json({ sessionId: session.id });
  } catch (err) {
    console.error("Checkout session error:", err);
    return res.status(500).json({
      error:   "Payment session creation failed",
      details: err.message
    });
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────────

// Main endpoints
app.post("/checkout", handleCheckout);
app.post("/createCheckoutSession", handleCheckout);

// Stripe webhook
app.post(
  "/webhook",
  express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }),
  async (req, res) => {
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers["stripe-signature"],
        WEBHOOK_SECRET
      );
    } catch (e) {
      console.error("⚠️  Webhook signature failed:", e.message);
      return res.status(400).send(`Webhook Error: ${e.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const m      = session.metadata||{};
      let items    = [];
      if (m.cart) {
        items = JSON.parse(m.cart);
        await updateStock(items.map(i => ({ id: i.id, quantity: i.quantity })));
      }

      const record = {
        sessionId:     session.id,
        createdAt:     admin.firestore.FieldValue.serverTimestamp(),
        amount_total:  session.amount_total/100,
        currency:      session.currency,
        paymentStatus: session.payment_status,
        boatName:      m.boatName,
        orderDate:     m.orderDate,
        customerEmail: session.customer_email,
        fullName:      m.fullName,
        rentalCompany: m.rentalCompany,
        phoneNumber:   m.phoneNumber,
        specialNotes:  m.specialNotes,
        paymentMethod: m.paymentMethod,
        orderId:       m.orderId,
        boatLocation:  m.boatLocation||"Not specified",
        items
      };

      try {
        await admin.firestore().collection("orders").add(record);
        await sendOrderConfirmationEmail({
          email:       session.customer_email,
          boatName:    m.boatName,
          orderDate:   m.orderDate,
          fullName:    m.fullName,
          phoneNumber: m.phoneNumber,
          specialNotes:m.specialNotes,
          items,
          totalPrice:  session.amount_total/100,
          boatLocation:m.boatLocation,
          orderId:     m.orderId
        });
      } catch (e) {
        console.error("Order save/email error:", e);
      }
    }

    res.status(200).send("OK");
  }
);

// Health‐check
app.get("/healthz", (_req, res) => res.status(200).send("OK"));

// ─── Export as a v2 HTTPS Function ─────────────────────────────────────────────
exports.api = onRequest(
  {
    region:       "us-central1",
    maxInstances: 5
  },
  app
);
















