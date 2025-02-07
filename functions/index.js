const functions = require("firebase-functions");
const cors = require("cors");
const fetch = require("node-fetch");
const stripe = require("stripe")(functions.config().stripe.secret_key);
const sgMail = require("@sendgrid/mail");

// 1) Import and initialize admin
const admin = require("firebase-admin");
admin.initializeApp();

sgMail.setApiKey(functions.config().sendgrid.api_key); // Set SendGrid API Key

// Initialise CORS middleware
const corsHandler = cors({
  origin: true, // Allow all origins
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
});

/**
 * A helper function to decrement product stock after purchase.
 * Expects each purchased item to have: { id, quantity }
 */
async function updateStock(items) {
  const db = admin.firestore();
  await db.runTransaction(async (transaction) => {
    for (const item of items) {
      const productRef = db.collection("products").doc(item.id);
      const productSnap = await transaction.get(productRef);

      if (!productSnap.exists) {
        console.warn(`Product doc not found: ${item.id}`);
        continue;
      }

      const currentStock = productSnap.data().stock || 0;
      let newStock = currentStock - item.quantity;
      if (newStock < 0) {
        // You can decide how to handle negative stock
        // e.g. set to 0 or throw an error
        newStock = 0;
      }

      transaction.update(productRef, { stock: newStock });
    }
  });
  console.log("Stock update transaction successful.");
}

// ✅ Create Stripe Checkout Session
exports.createCheckoutSession = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      // Destructure fields from the request body
      const {
        cart,
        boatName,
        orderDate,
        customerEmail,
        fullName,
        rentalCompany,
        phoneNumber,
        specialNotes,
        paymentMethod
      } = req.body;

      if (!cart || !Array.isArray(cart) || cart.length === 0 || !customerEmail) {
        return res.status(400).json({ error: "Invalid cart data or missing email" });
      }

      // Build line items for Stripe
      const lineItems = cart.map(item => ({
        price_data: {
          currency: "eur",
          product_data: { name: item.name },
          unit_amount: Math.round(item.price * 100)
        },
        quantity: item.quantity
      }));

      // Create the Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        customer_email: customerEmail,
        line_items: lineItems,
        mode: "payment",
        success_url: `${req.headers.origin}/success.html`,
        cancel_url: `${req.headers.origin}/services.html`,
        // Pass the entire cart in metadata, as a JSON string
        metadata: {
          orderId: Date.now().toString(),
          boatName,
          orderDate,
          customerEmail,
          fullName,
          rentalCompany,
          phoneNumber,
          specialNotes,
          paymentMethod,
          cart: JSON.stringify(cart)  // <--- Key line to store cart
        }
      });

      return res.json({ sessionId: session.id });
    } catch (error) {
      console.error("Checkout session error:", error);
      return res.status(500).json({
        error: "Payment session creation failed",
        details: error.message
      });
    }
  });
});


// ✅ Handle Stripe Webhook Events (DB Write + Stock + Confirmation Email)
exports.handleStripeWebhook = functions.https.onRequest(async (req, res) => {
  const endpointSecret = functions.config().stripe.webhook_secret;
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    // Validate the event from Stripe
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    console.error("Webhook signature verification failed.", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("Received Stripe event:", event.type);

  // Only handle checkout.session.completed for now
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    console.log("Payment successful for:", session.id);

    // Extract metadata
    const {
      boatName,
      orderDate,
      customerEmail,
      fullName,
      rentalCompany,
      phoneNumber,
      specialNotes,
      paymentMethod,
      orderId,
      cart  // <-- JSON string containing purchased items
    } = session.metadata || {};

    // 1) Parse the cart so we know which items to decrement
    let purchasedItems = [];
    if (cart) {
      try {
        purchasedItems = JSON.parse(cart);
        console.log("Purchased items:", purchasedItems);
      } catch (parseErr) {
        console.error("Error parsing cart JSON:", parseErr);
      }
    }

    // 2) Update stock in Firestore
    try {
      await updateStock(purchasedItems);
      console.log("Stock updated successfully.");
    } catch (updateErr) {
      console.error("Error updating stock:", updateErr);
    }

    // 3) Build and save the order to Firestore
    const orderData = {
      sessionId: session.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      amount_total: session.amount_total / 100 || null, // if you want the total
      currency: session.currency || "eur",
      paymentStatus: session.payment_status, // 'paid' if successful
      boatName,
      orderDate,
      customerEmail,
      fullName,
      rentalCompany,
      phoneNumber,
      specialNotes,
      paymentMethod,
      orderId,
      items: purchasedItems  // optional: store the full purchased cart
    };

    try {
      const db = admin.firestore();
      await db.collection("orders").add(orderData);
      console.log("Order saved to Firestore:", orderId);
    } catch (firestoreError) {
      console.error("Error saving order to Firestore:", firestoreError);
    }

    // 4) Send confirmation email
    try {
      await sendOrderConfirmationEmail(customerEmail, boatName, orderDate, fullName);
    } catch (emailError) {
      console.error("Error sending confirmation email:", emailError);
    }
  }

  // Handle other events if needed
  if (event.type === "checkout.session.expired" || event.type === "payment_intent.payment_failed") {
    console.log("Payment failed for:", event.data.object.id);
    res.redirect(303, `${req.headers.origin}/cancel.html`);
  }

  // Respond 200 so Stripe knows we handled the webhook
  res.status(200).send("Webhook received");
});

// ✅ SendGrid Email
async function sendOrderConfirmationEmail(email, boatName, orderDate, fullName, phoneNumber, specialNotes, items, totalPrice) {
  const msg = {
    to: email,
    from: "info@justenjoyibiza.com", // Must be verified in SendGrid
    templateId: "d-519fbb63105146899cbd444ef8ff60a9", // Your Dynamic Template ID
    dynamic_template_data: {
      customer_name: fullName,
      boat_name: boatName,
      order_date: orderDate,
      phone_number: phoneNumber,
      special_notes: specialNotes,
      total_price: totalPrice,
      items: items,     // an array that matches #each logic
      track_link: "https://your-site.com/track-order/1234" // or some dynamic link
    },
  };

  try {
    await sgMail.send(msg);
    console.log("Confirmation email sent to", email);
  } catch (error) {
    console.error("Email sending error:", error);
  }
}












