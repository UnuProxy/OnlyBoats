// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Add logging for environment variables (redact sensitive info)
console.log('Environment variables loaded:', {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKeyExists: !!process.env.FIREBASE_PRIVATE_KEY
});

// Initialize Firebase Admin with error handling
const admin = require('firebase-admin');
try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('🔥 Firebase initialization error:', error);
}

const db = admin.firestore();
const app = express();

// Add CSP headers
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; font-src 'self' data: fonts.gstatic.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com; img-src 'self' data:;"
  );
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Test route
// server.js - Update the static file serving
app.use(express.static(path.join(__dirname, 'public')));

// Add this route before your other routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'yacht-rental.html'));
});

// Make sure your API route is correct
app.get('/api/firebase-config', (req, res) => {
    const clientConfig = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID
    };
    res.json(clientConfig);
});

// Get all yachts
app.get('/api/yachts', async (req, res) => {
  try {
    const yachtsRef = db.collection('yachts');
    const snapshot = await yachtsRef.get();
    const yachts = [];
    
    snapshot.forEach(doc => {
      yachts.push({ id: doc.id, ...doc.data() });
    });
    
    res.json(yachts);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Get yacht by ID
app.get('/api/yachts/:id', async (req, res) => {
  try {
    const yachtRef = db.collection('yachts').doc(req.params.id);
    const yacht = await yachtRef.get();
    
    if (!yacht.exists) {
      res.status(404).send('Yacht not found');
    } else {
      res.json({ id: yacht.id, ...yacht.data() });
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Filter yachts
app.get('/api/yachts/filter', async (req, res) => {
  try {
    const { type, minCapacity, maxPrice } = req.query;
    let query = db.collection('yachts');
    
    if (type) {
      query = query.where('type', '==', type);
    }
    if (minCapacity) {
      query = query.where('capacity', '>=', parseInt(minCapacity));
    }
    if (maxPrice) {
      query = query.where('price', '<=', parseInt(maxPrice));
    }
    
    const snapshot = await query.get();
    const yachts = [];
    
    snapshot.forEach(doc => {
      yachts.push({ id: doc.id, ...doc.data() });
    });
    
    res.json(yachts);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Create new yacht
app.post('/api/yachts', async (req, res) => {
  try {
    const newYacht = req.body;
    const docRef = await db.collection('yachts').add(newYacht);
    res.status(201).json({ id: docRef.id, ...newYacht });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const productsRef = db.collection('products');
    const snapshot = await productsRef.get();
    
    if (snapshot.empty) {
      return res.status(404).json({ message: "No products found" });
    }

    const products = [];
    snapshot.forEach(doc => {
      products.push({ id: doc.id, ...doc.data() });
    });

    console.log("✅ Products Fetched:", products);
    res.status(200).json(products);
  } catch (error) {
    console.error("🔥 Error fetching products:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update yacht
app.put('/api/yachts/:id', async (req, res) => {
  try {
    const yachtRef = db.collection('yachts').doc(req.params.id);
    await yachtRef.update(req.body);
    res.json({ id: req.params.id, ...req.body });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Delete yacht
app.delete('/api/yachts/:id', async (req, res) => {
  try {
    await db.collection('yachts').doc(req.params.id).delete();
    res.json({ message: 'Yacht deleted successfully' });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Add error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});