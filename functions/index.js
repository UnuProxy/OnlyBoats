const functions = require("firebase-functions");
const cors = require("cors");
const fetch = require("node-fetch");
const stripe = require("stripe")(functions.config().stripe.secret_key);
const sgMail = require("@sendgrid/mail");

// Initialize admin with credential check
const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
}

sgMail.setApiKey(functions.config().sendgrid.api_key);

const corsHandler = cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
});

/**
 * Helper function to decrement product stock after purchase.
 * Uses admin privileges to bypass security rules.
 */
async function updateStock(items) {
    if (!items || !Array.isArray(items)) {
        console.error('Invalid items array provided to updateStock');
        return;
    }

    const db = admin.firestore();
    console.log("Starting stock update process with items:", items);

    try {
        await db.runTransaction(async (transaction) => {
            console.log("Beginning Firestore transaction");

            const productRefs = items.map(item => ({
                ref: db.collection("products").doc(item.id),
                quantity: parseInt(item.quantity)
            }));

            console.log("Product references created:", productRefs.map(ref => ref.ref.path));

            const productSnapshots = await Promise.all(
                productRefs.map(async ({ ref }) => {
                    const snap = await transaction.get(ref);
                    if (snap.exists) {
                        console.log(`Product ${ref.id} current data:`, snap.data());
                    } else {
                        console.error(`Product ${ref.id} not found in database`);
                    }
                    return snap;
                })
            );

            const invalidProducts = productSnapshots.map((snap, index) => {
                if (!snap.exists) {
                    return `Product ${items[index].id} not found`;
                }
                const currentStock = snap.data().stock || 0;
                if (currentStock < items[index].quantity) {
                    return `Insufficient stock for product ${items[index].id}`;
                }
                return null;
            }).filter(error => error !== null);

            if (invalidProducts.length > 0) {
                throw new Error(`Stock update failed: ${invalidProducts.join(', ')}`);
            }

            productSnapshots.forEach((snap, index) => {
                const currentStock = snap.data().stock;
                const newStock = Math.max(0, currentStock - productRefs[index].quantity);
                
                console.log(`Updating stock for ${snap.id} from ${currentStock} to ${newStock}`);
                
                transaction.update(productRefs[index].ref, {
                    stock: newStock,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });
            });
        });

        console.log("Stock update transaction completed successfully");
        return true;
    } catch (error) {
        console.error("Error in stock update transaction:", error);
        console.error("Stack trace:", error.stack);
        throw error;
    }
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

      console.log("Creating checkout session with cart:", cart);

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
          cart: JSON.stringify(cart)
        }
      });

      console.log("Checkout session created:", session.id);
      console.log("Session metadata sent to Stripe:", session.metadata); // Log metadata sent

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
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    console.error("Webhook signature verification failed.", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("Received Stripe event:", event.type);

  // Only handle checkout.session.completed for now
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    console.log("Payment successful for session:", session.id);
    console.log("Session metadata (raw):", session.metadata); // Log raw metadata

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
      cart
    } = session.metadata || {};

    console.log("Extracted metadata - cart (string):", cart); // Log cart string as extracted

    // Parse the cart and update stock
    let purchasedItems = [];
    if (cart) {
      try {
        purchasedItems = JSON.parse(cart);
        console.log("Parsed purchased items (array):", purchasedItems); // Log parsed cart array

        if (!Array.isArray(purchasedItems)) {
          throw new Error('Parsed cart is not an array');
        }

        // Ensure we have the required fields for stock update
        const stockUpdateItems = purchasedItems.map(item => {
          console.log("Processing item for stock update:", item);
          return {
            id: item.id,
            quantity: parseInt(item.quantity)
          };
        });

        console.log("Prepared stock update items:", stockUpdateItems);

        // Update stock with error handling
        await updateStock(stockUpdateItems);
        console.log("Stock updated successfully");
      } catch (error) {
        console.error("Error processing cart or updating stock:", error);
        console.error("Error details (cart parsing):", error.stack); // More specific error log
      }
    } else {
      console.warn("No cart data found in session metadata");
    }

    // Build and save the order to Firestore
    const orderData = {
      sessionId: session.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      amount_total: session.amount_total / 100 || null,
      currency: session.currency || "eur",
      paymentStatus: session.payment_status,
      boatName,
      orderDate,
      customerEmail,
      fullName,
      rentalCompany,
      phoneNumber,
      specialNotes,
      paymentMethod,
      orderId,
      items: purchasedItems
    };

    try {
      const db = admin.firestore();
      const orderRef = await db.collection("orders").add(orderData);
      console.log("Order saved to Firestore:", orderRef.id);
    } catch (firestoreError) {
      console.error("Error saving order to Firestore:", firestoreError);
      console.error("Error details:", firestoreError.stack);
    }

    // Send confirmation email
    try {
      await sendOrderConfirmationEmail(
        customerEmail,
        boatName,
        orderDate,
        fullName,
        phoneNumber,
        specialNotes,
        purchasedItems,
        session.amount_total / 100
      );
      console.log("Confirmation email sent successfully");
    } catch (emailError) {
      console.error("Error sending confirmation email:", emailError);
      console.error("Error details:", emailError.stack);
    }
  }

  if (event.type === "checkout.session.expired" || event.type === "payment_intent.payment_failed") {
    console.log("Payment failed for:", event.data.object.id);
  }

  res.status(200).send("Webhook received");
});

// ✅ SendGrid Email
async function sendOrderConfirmationEmail(email, boatName, orderDate, fullName, phoneNumber, specialNotes, items, totalPrice) {
  const msg = {
    to: email,
    from: "info@justenjoyibiza.com",
    templateId: "d-519fbb63105146899cbd444ef8ff60a9",
    dynamic_template_data: {
      customer_name: fullName,
      boat_name: boatName,
      order_date: orderDate,
      phone_number: phoneNumber,
      special_notes: specialNotes,
      total_price: totalPrice,
      items: items,
      track_link: "https://your-site.com/track-order/1234"
    },
  };

  try {
    await sgMail.send(msg);
    console.log("Confirmation email sent to", email);
  } catch (error) {
    console.error("Email sending error:", error);
    console.error("Error details:", error.stack);
  }
}












