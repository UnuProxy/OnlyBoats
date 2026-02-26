import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Configuration, OpenAIApi } from 'openai';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Initialize OpenAI
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not defined in environment variables');
}
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// === API Routes ===

// Firebase config route for client-side initialization
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

// NEW: Save Message endpoint - allows saving messages without firebase auth
app.post('/api/save-message', async (req, res) => {
  console.log('Save message endpoint hit:', req.body);
  try {
    const { conversationId, messageId, role, content, userName, browserUid } = req.body;
    
    if (!conversationId || !messageId || !role || content === undefined) {
      console.log('Missing required fields:', { conversationId, messageId, role, content });
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Create a batch operation for atomic updates
    const batch = db.batch();
    
    // Reference to the conversation document
    const conversationRef = db.collection('chatConversations').doc(conversationId);
    
    // Reference to the message document
    const messageRef = conversationRef.collection('messages').doc(messageId);
    
    // Set the message data
    batch.set(messageRef, {
      role,
      content,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      messageId
    });
    
    // Prepare conversation update data
    const conversationData = {
      lastMessage: content,
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageRole: role,
      status: role === 'agent' ? 'agent-handling' : 'active',
      lastMessageId: messageId
    };
    
    // Add the username if provided
    if (userName) {
      conversationData.userName = userName;
    }
    
    // Add browser unique ID if provided (for tracking without authentication)
    if (browserUid) {
      conversationData.browserUid = browserUid;
    }
    
    // Update the conversation document
    batch.set(conversationRef, conversationData, { merge: true });
    
    // Commit both operations
    await batch.commit();
    console.log('Message saved successfully:', messageId);
    
    // Return success response
    return res.status(200).json({ 
      success: true, 
      messageId 
    });
  } catch (error) {
    console.error('Error saving message:', error);
    return res.status(500).json({ 
      error: 'Failed to save message', 
      message: error.message 
    });
  }
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  console.log('Chat endpoint hit:', req.body);
  try {
    const { userMessage, conversationId, userName, agentName } = req.body;
    if (!userMessage || !conversationId) {
      console.log('Missing required fields:', { userMessage, conversationId });
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const conversationRef = db.collection('chatConversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();
    const conversationData = conversationDoc.data() || {};

    console.log('Fetching conversation history...');
    const messagesSnapshot = await conversationRef
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .limit(10)
      .get();

    const conversationHistory = messagesSnapshot.docs.map(doc => {
      const msg = doc.data();
      return {
        role: msg.role === 'bot' ? 'assistant' : 'user',
        content: msg.content
      };
    });

    // Updated system prompt with dynamic agent introduction
    const systemMessage = {
      role: 'system',
      content: `You are a friendly and knowledgeable yacht rental assistant for Just Enjoy Ibiza Boats.
      When greeting a user for the first time, always introduce yourself with your current name, for example:
      "Hi, I'm ${agentName}. How can I help you today?"
      You help customers with yacht rentals, boat information, and booking inquiries in Ibiza.
      Keep responses concise and focused on yachts and boats.
      The current user's name is ${userName || 'Guest'}.
      Always maintain a friendly, professional tone.
      Include specific information about yacht options, prices, and availability when relevant.`
    };

    const messages = [
      systemMessage,
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    console.log('Sending request to OpenAI...');
    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: messages,
      max_tokens: 150,
      temperature: 0.7
    });

    const botResponse = completion.data.choices[0].message.content;
    console.log('Received response from OpenAIApi:', botResponse);

    console.log('Saving response to Firestore...');
    const batch = db.batch();
    batch.set(
      conversationRef,
      {
        lastMessage: botResponse,
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        userName: userName,
        status: 'active'
      },
      { merge: true }
    );

    const botMessageRef = conversationRef.collection('messages').doc();
    batch.set(botMessageRef, {
      role: 'bot',
      content: botResponse,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      messageId: botMessageRef.id
    });

    await batch.commit();
    console.log('Response saved successfully');

    res.json({ response: botResponse, messageId: botMessageRef.id });
  } catch (error) {
    console.error('Chat endpoint error:', error);
    if (error.response) {
      console.error('OpenAI API error:', error.response.data);
    }
    res.status(500).json({ error: 'Internal server error', message: error.message });
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

// === Static Files ===
app.use(express.static('public'));
app.use(express.static(path.join(__dirname, 'public')));

// Main route (should be after the API routes)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'yacht-rental.html'));
});

// Start server
const parsedPort = Number.parseInt(process.env.PORT || '3000', 10);
const START_PORT = Number.isNaN(parsedPort) ? 3000 : parsedPort;
const MAX_PORT_ATTEMPTS = process.env.NODE_ENV === 'production' ? 1 : 10;

function startServer(port, attempt = 1) {
  const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`API endpoints available at http://localhost:${port}/api/`);
  });

  server.on('error', (error) => {
    const canRetry = error.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS;

    if (canRetry) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is in use. Trying port ${nextPort}...`);
      startServer(nextPort, attempt + 1);
      return;
    }

    console.error(`Failed to start server on port ${port}:`, error.message);
    process.exit(1);
  });
}

startServer(START_PORT);
