const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Initialize Firebase Admin
const admin = require('firebase-admin');

// Parse the service account from environment variable
let serviceAccount;
try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} catch (error) {
    console.error('Error parsing service account:', error);
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// === API Routes First ===
// Firebase config route
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

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    console.log('Chat endpoint hit:', req.body);
    try {
        const { userMessage, conversationId, userName } = req.body;

        if (!userMessage || !conversationId) {
            return res.status(400).json({
                error: 'Missing required fields'
            });
        }

        const conversationRef = db.collection('chatConversations').doc(conversationId);
        const conversationDoc = await conversationRef.get();
        const conversationData = conversationDoc.data();

        if (conversationData?.status === 'agent-handling') {
            return res.status(200).json({
                response: null,
                status: 'agent-handling'
            });
        }

        let botResponse = `Thanks for your message about "${userMessage}". How can I help you explore Ibiza today?`;

        if (userMessage.toLowerCase().includes('yacht') || userMessage.toLowerCase().includes('boat')) {
            botResponse = "I can help you find the perfect yacht for your needs. Would you like to know about our available yachts?";
        } else if (userMessage.toLowerCase().includes('price') || userMessage.toLowerCase().includes('cost')) {
            botResponse = "Our prices vary depending on the yacht and duration. Would you like to see our pricing options?";
        } else if (userMessage.toLowerCase().includes('book') || userMessage.toLowerCase().includes('reservation')) {
            botResponse = "I'd be happy to help you with a booking. When would you like to schedule your yacht experience?";
        }

        await conversationRef.set({
            lastMessage: userMessage,
            lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
            userName: userName,
            status: 'active'
        }, { merge: true });

        res.json({ response: botResponse });

    } catch (error) {
        console.error('Chat endpoint error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
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
        console.error('Error fetching yachts:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get yacht by ID
app.get('/api/yachts/:id', async (req, res) => {
    try {
        const yachtRef = db.collection('yachts').doc(req.params.id);
        const yacht = await yachtRef.get();
        
        if (!yacht.exists) {
            return res.status(404).json({ message: 'Yacht not found' });
        }
        
        res.json({ id: yacht.id, ...yacht.data() });
    } catch (error) {
        console.error('Error fetching yacht:', error);
        res.status(500).json({ error: error.message });
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
        console.error('Error filtering yachts:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create new yacht
app.post('/api/yachts', async (req, res) => {
    try {
        const newYacht = req.body;
        const docRef = await db.collection('yachts').add(newYacht);
        res.status(201).json({ id: docRef.id, ...newYacht });
    } catch (error) {
        console.error('Error creating yacht:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all products
app.get('/api/products', async (req, res) => {
    try {
        const productsRef = db.collection('products');
        const snapshot = await productsRef.get();
        const products = [];
        
        snapshot.forEach(doc => {
            products.push({ id: doc.id, ...doc.data() });
        });

        res.json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get product by ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const productRef = db.collection('products').doc(req.params.id);
        const product = await productRef.get();
        
        if (!product.exists) {
            return res.status(404).json({ message: 'Product not found' });
        }
        
        res.json({ id: product.id, ...product.data() });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create new product
app.post('/api/products', async (req, res) => {
    try {
        const newProduct = req.body;
        const docRef = await db.collection('products').add(newProduct);
        res.status(201).json({ id: docRef.id, ...newProduct });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete yacht by ID
app.delete('/api/yachts/:id', async (req, res) => {
    try {
        const yachtRef = db.collection('yachts').doc(req.params.id);
        await yachtRef.delete();
        res.status(200).json({ message: 'Yacht deleted successfully' });
    } catch (error) {
        console.error('Error deleting yacht:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete product by ID
app.delete('/api/products/:id', async (req, res) => {
    try {
        const productRef = db.collection('products').doc(req.params.id);
        await productRef.delete();
        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update yacht by ID
app.put('/api/yachts/:id', async (req, res) => {
    try {
        const yachtRef = db.collection('yachts').doc(req.params.id);
        await yachtRef.update(req.body);
        res.status(200).json({ message: 'Yacht updated successfully' });
    } catch (error) {
        console.error('Error updating yacht:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update product by ID
app.put('/api/products/:id', async (req, res) => {
    try {
        const productRef = db.collection('products').doc(req.params.id);
        await productRef.update(req.body);
        res.status(200).json({ message: 'Product updated successfully' });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: error.message });
    }
});

// === Static Files After API Routes ===
app.use(express.static('public'));
app.use(express.static(path.join(__dirname, 'public')));

// Main route - should be after API routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'yacht-rental.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API endpoints available at http://localhost:${PORT}/api/`);
});