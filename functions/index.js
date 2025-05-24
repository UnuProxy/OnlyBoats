const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// Initialize Firebase Admin
admin.initializeApp();

// Get configuration
const config = functions.config();
const stripe = require("stripe")(config.stripe.secret_key);
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(config.sendgrid.api_key);

const WEBHOOK_SECRET = config.stripe.webhook_secret || "";

// Create Express app
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Stock update helper
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
        if (!snap.exists) return `Missing ${refs[i].ref.id}`;
        if ((snap.data().stock || 0) < refs[i].qty) return `Insufficient stock for ${snap.id}`;
        return null;
      })
      .filter(e => e);
    if (errors.length) throw new Error(errors.join(", "));
    snaps.forEach((snap, i) => {
      const newStock = Math.max(0, (snap.data().stock || 0) - refs[i].qty);
      txn.update(refs[i].ref, {
        stock: newStock,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
    });
  });
}

// Email helper with debugging
async function sendOrderConfirmationEmail(data) {
  try {
    console.log('EMAIL DEBUG: Sending to', data.email);
    console.log('EMAIL DEBUG: API Key exists:', !!config.sendgrid?.api_key);
    
    const msg = {
      to: data.email,
      from: "info@justenjoyibiza.com",
      templateId: "d-519fbb63105146899cbd444ef8ff60a9",
      dynamic_template_data: {
        customer_name: data.fullName || "Customer",
        boat_name: data.boatName || "",
        order_date: data.orderDate || "",
        phone_number: data.phoneNumber || "",
        special_notes: data.specialNotes || "",
        boat_location: data.boatLocation || "",
        total_price: data.totalPrice || 0,
        items: data.items || [],
        track_link: `https://your-site.com/track-order/${data.orderId}`
      }
    };

    console.log('EMAIL DEBUG: Calling SendGrid API...');
    const response = await sgMail.send(msg);
    console.log('EMAIL DEBUG: Success! Status:', response[0].statusCode);
    return response;
    
  } catch (error) {
    console.error('EMAIL ERROR:', error.message);
    if (error.response) {
      console.error('EMAIL ERROR Details:', JSON.stringify(error.response.body, null, 2));
    }
    throw error;
  }
}

// Checkout handler
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

    const line_items = cart.map(item => ({
      price_data: {
        currency: "eur",
        product_data: { name: item.name },
        unit_amount: Math.round(item.price * 100)
      },
      quantity: item.quantity
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: finalEmail,
      line_items,
      mode: "payment",
      success_url: `${req.headers.origin}/success.html`,
      cancel_url: `${req.headers.origin}/services.html`,
      metadata: {
        orderId: Date.now().toString(),
        boatName,
        orderDate,
        customerEmail: finalEmail,
        fullName,
        rentalCompany,
        phoneNumber,
        specialNotes,
        paymentMethod,
        boatLocation: boatLocation || "",
        cart: JSON.stringify(cart)
      }
    });

    return res.json({ sessionId: session.id });
  } catch (err) {
    console.error("Checkout error:", err);
    return res.status(500).json({
      error: "Payment session creation failed",
      details: err.message
    });
  }
}

// Routes
app.post("/checkout", handleCheckout);
app.post("/createCheckoutSession", handleCheckout);

// Webhook handler
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
      console.error("Webhook signature failed:", e.message);
      return res.status(400).send(`Webhook Error: ${e.message}`);
    }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const m = session.metadata || {};
    let items = [];

    console.log('WEBHOOK: Processing session', session.id);
    console.log('WEBHOOK: Customer email', session.customer_email);

    if (m.cart) {
      items = JSON.parse(m.cart);
      try {
        await updateStock(items.map(i => ({ id: i.id, quantity: i.quantity })));
      } catch (stockError) {
        console.error('Stock update error:', stockError);
      }
    }

    const record = {
      sessionId: session.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      amount_total: session.amount_total / 100,
      currency: session.currency,
      paymentStatus: session.payment_status,
      boatName: m.boatName,
      orderDate: m.orderDate,
      customerEmail: session.customer_email,
      fullName: m.fullName,
      rentalCompany: m.rentalCompany,
      phoneNumber: m.phoneNumber,
      specialNotes: m.specialNotes,
      paymentMethod: m.paymentMethod,
      orderId: m.orderId,
      boatLocation: m.boatLocation || "Not specified",
      items
    };

    try {
      await admin.firestore().collection("orders").add(record);
      console.log('WEBHOOK: Order saved');

      await sendOrderConfirmationEmail({
        email: session.customer_email,
        boatName: m.boatName,
        orderDate: m.orderDate,
        fullName: m.fullName,
        phoneNumber: m.phoneNumber,
        specialNotes: m.specialNotes,
        items,
        totalPrice: session.amount_total / 100,
        boatLocation: m.boatLocation,
        orderId: m.orderId
      });

      console.log('WEBHOOK: Email sent successfully');

    } catch (e) {
      console.error("WEBHOOK: Error processing order:", e);
    }
  }

  res.status(200).send("OK");
});

// Test email route
app.post("/test-email", async (req, res) => {
  try {
    const testEmail = req.body.email || "test@example.com";
    
    await sendOrderConfirmationEmail({
      email: testEmail,
      fullName: "Test Customer",
      boatName: "Test Boat",
      orderDate: "2025-05-24",
      phoneNumber: "+34 123 456 789",
      specialNotes: "Test order",
      items: [{ name: "Test Item", quantity: 1, price: 99.99 }],
      totalPrice: 99.99,
      boatLocation: "Test Marina",
      orderId: "TEST-" + Date.now()
    });
    
    res.json({ success: true, message: "Test email sent" });
    
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health check
app.get("/", (req, res) => res.send("API is running"));
app.get("/healthz", (req, res) => res.send("OK"));

// Export as V1 function - EXPLICIT V1 ONLY
exports.apiNew = functions.https.onRequest(app);
















