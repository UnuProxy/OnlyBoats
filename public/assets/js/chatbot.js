window.initFirebase = async function() {
    if (window.db) {
        return window.db; // Return existing instance if already initialized
    }

    try {
        // Check if Firebase SDK is loaded
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase SDK not loaded');
        }

        // Fetch Firebase config
        const response = await fetch('/api/firebase-config');
        if (!response.ok) {
            throw new Error(`Failed to fetch Firebase config: ${response.status}`);
        }
        
        const firebaseConfig = await response.json();

        // Initialize Firebase if not already initialized
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        // Initialize Firestore and auth
        window.db = firebase.firestore();
        await firebase.auth().signInAnonymously();

        console.log('Firebase initialized successfully');
        return window.db;
    } catch (error) {
        console.error('Firebase initialization error:', error);
        throw error;
    }
};

// Add initialization check function
async function ensureFirebaseInitialized() {
    if (!window.db) {
        try {
            await window.initFirebase();
        } catch (error) {
            console.error('Failed to initialize Firebase:', error);
            throw new Error('Database not initialized');
        }
    }
    return window.db;
}


document.addEventListener('DOMContentLoaded', async () => {
    // === DOM Elements ===
    const chatbotWidget = document.getElementById('chatbot-widget');
    const agentNameElement = document.getElementById('agent-name');
    const agentPhoto = document.getElementById('agent-photo');
    const messagesContainer = document.getElementById('messages');
    const userInputField = document.getElementById('user-input');
    const sendButton = document.getElementById('send-btn');
    const BASE_API_URL = window.location.origin;

    // === State Management ===
    const state = {
        processedMessages: new Set(),
        initialized: false,
        unsubscribeHandlers: new Set(),
        conversationId: localStorage.getItem('conversationId'),
        userName: localStorage.getItem('userName'),
        userDetailsSubmitted: false,
        isAgentHandling: false,
        isProcessingMessage: false,
        isFirstMessage: true,
        isWaitingForName: false
    };

    // Generate new conversationId if none exists
    if (!state.conversationId) {
        state.conversationId = `conv_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        localStorage.setItem('conversationId', state.conversationId);
    }

    // === Core Functions ===
    function setupMessageListeners() {
        clearExistingListeners();
        
        // Conversation status listener
        const conversationUnsubscribe = window.db.collection('chatConversations')
            .doc(state.conversationId)
            .onSnapshot(doc => {
                const data = doc.data();
                if (data?.status === 'agent-handling' && !state.isAgentHandling) {
                    state.isAgentHandling = true;
                    handleAgentTakeover(data.agentId);
                }
            });
        state.unsubscribeHandlers.add(conversationUnsubscribe);

        // Load existing messages once
        window.db.collection('chatConversations')
            .doc(state.conversationId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .get()
            .then(snapshot => {
                messagesContainer.innerHTML = '';
                state.processedMessages.clear();
                
                snapshot.docs.forEach(doc => {
                    const message = doc.data();
                    const messageId = message.messageId || doc.id;
                    if (!state.processedMessages.has(messageId)) {
                        displayMessage(message.role, message.content, messageId);
                        state.processedMessages.add(messageId);
                    }
                });
            });

        // Real-time listener for new messages
        const messagesUnsubscribe = window.db.collection('chatConversations')
            .doc(state.conversationId)
            .collection('messages')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const message = change.doc.data();
                        const messageId = message.messageId || change.doc.id;
                        if (!state.processedMessages.has(messageId)) {
                            displayMessage(message.role, message.content, messageId);
                            state.processedMessages.add(messageId);
                        }
                    }
                });
            });
        state.unsubscribeHandlers.add(messagesUnsubscribe);
    }

    function clearExistingListeners() {
        state.unsubscribeHandlers.forEach(unsubscribe => unsubscribe());
        state.unsubscribeHandlers.clear();
    }

    function setDynamicAgentName() {
        const currentHour = new Date().getHours();
        let agentName = "Just Enjoy Ibiza Assistant";
        let photoSrc = "img/team/default.jpg";
        
        if (currentHour >= 7 && currentHour < 19) {
            agentName = "Julian (Available)";
            photoSrc = "img/team/Julian-small.png";
        } else {
            agentName = "Alin (Available)";
            photoSrc = "img/team/alin.png";
        }
        
        if (agentNameElement) agentNameElement.textContent = agentName;
        if (agentPhoto) agentPhoto.src = photoSrc;
    }

    async function showWelcomeMessage() {
        const welcomeMessage = "Hi there! 👋 I'm here to help you discover the best of Ibiza. What's your name so I can assist you better?";
        await saveMessageToFirestore('bot', welcomeMessage);
        state.isWaitingForName = true;
    }

    function displayMessage(role, content, messageId) {
        if (document.querySelector(`[data-message-id="${messageId}"]`)) return;
        
        const messageClass = role === 'user' ? 'user'
            : role === 'agent' ? 'agent'
            : role === 'system' ? 'system'
            : 'bot';

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${messageClass}`;
        messageDiv.setAttribute('data-message-id', messageId);
        messageDiv.textContent = content;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async function saveMessageToFirestore(role, content) {
        try {
            // Ensure Firebase is initialized
            await ensureFirebaseInitialized();
            
            const conversationRef = window.db.collection('chatConversations').doc(state.conversationId);
            
            return await window.db.runTransaction(async (transaction) => {
                const messageRef = conversationRef.collection('messages').doc();
                const messageId = messageRef.id;
                
                transaction.set(messageRef, {
                    role,
                    content,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    messageId
                });
    
                transaction.set(conversationRef, {
                    lastMessage: content,
                    lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastMessageRole: role,
                    status: role === 'agent' ? 'agent-handling' : (state.isAgentHandling ? 'agent-handling' : 'active'),
                    lastMessageId: messageId
                }, { merge: true });
    
                return messageId;
            });
        } catch (error) {
            console.error('Error saving message:', error);
            throw error; // Re-throw the error to be handled by the caller
        }
    }

    function handleAgentTakeover(agentId) {
        state.isAgentHandling = true;
        state.userDetailsSubmitted = true;
        
        const takeoverMessage = document.createElement('div');
        takeoverMessage.className = 'message system';
        takeoverMessage.textContent = 'An agent has joined the conversation and will assist you shortly.';
        messagesContainer.appendChild(takeoverMessage);
        
        if (agentNameElement) {
            agentNameElement.textContent = `${agentId} (Live Agent)`;
        }
    }

    async function handleNameInput(userInput) {
        const name = userInput.trim();
        if (name.length > 0) {
            state.userName = name;
            localStorage.setItem('userName', state.userName);
            state.userDetailsSubmitted = true;
            state.isWaitingForName = false;

            await window.db.collection('chatConversations')
                .doc(state.conversationId)
                .set({
                    userName: state.userName,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

            await saveMessageToFirestore('bot', `Nice to meet you, ${state.userName}! How can I help you explore Ibiza today?`);
            return true;
        }
        
        await saveMessageToFirestore('bot', "I didn't quite catch your name. Could you please tell me again?");
        return false;
    }

    
   // === Message Handling ===
   window.sendMessage = async () => {
    if (state.isProcessingMessage) return;
    state.isProcessingMessage = true;
    
    // Get DOM elements inside the function
    const sendButton = document.getElementById('send-btn');
    const userInputField = document.getElementById('user-input');
    
    if (sendButton) sendButton.disabled = true;

    // Get user input value and check BASE_API_URL
    const userInput = userInputField ? userInputField.value.trim() : '';
    console.log('window.location:', window.location);
    console.log('window.location.origin:', window.location.origin);
    console.log('BASE_API_URL:', BASE_API_URL);
    console.log('Full API URL:', `${BASE_API_URL}/api/chat`);
    
    // Debug logs to verify data
    console.log('Starting message send process with:', {
        userInput,
        conversationId: state.conversationId,
        userName: state.userName,
        isAgentHandling: state.isAgentHandling,
        isWaitingForName: state.isWaitingForName
    });

    if (!userInput) {
        console.log('Empty input, cancelling send');
        state.isProcessingMessage = false;
        if (sendButton) sendButton.disabled = false;
        return;
    }

    try {
        // First save user message to Firestore
        console.log('Saving message to Firestore...');
        const messageId = await saveMessageToFirestore('user', userInput);
        if (!messageId) throw new Error('Failed to save message');
        console.log('Message saved with ID:', messageId);
        
        // Clear input field
        if (userInputField) userInputField.value = '';

        if (!state.isAgentHandling) {
            if (state.isWaitingForName) {
                console.log('Handling name input...');
                await handleNameInput(userInput);
            } else {
                try {
                    const apiUrl = `${BASE_API_URL}/api/chat`;
                    console.log('Making API call to:', apiUrl);
                    console.log('Request body:', {
                        userMessage: userInput,
                        conversationId: state.conversationId,
                        userName: state.userName
                    });

                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({ 
                            userMessage: userInput, 
                            conversationId: state.conversationId,
                            userName: state.userName
                        })
                    });

                    console.log('API response status:', response.status);
                    console.log('API response headers:', [...response.headers.entries()]);
                    
                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error('Error response body:', errorText);
                        throw new Error(`HTTP error: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    console.log('API response data:', data);
                    
                    const currentStatus = (await window.db.collection('chatConversations')
                        .doc(state.conversationId)
                        .get()).data()?.status;
                    console.log('Current conversation status:', currentStatus);
                        
                    if (currentStatus !== 'agent-handling') {
                        await saveMessageToFirestore('bot', data.response || "I'm here to help!");
                    }
                } catch (error) {
                    console.error("API error details:", error);
                    await saveMessageToFirestore('system', "Service temporarily unavailable.");
                }
            }
        }
    } catch (error) {
        console.error('Error in sendMessage:', error);
        await saveMessageToFirestore('system', 'Failed to send message. Please try again.');
    } finally {
        state.isProcessingMessage = false;
        if (sendButton) sendButton.disabled = false;
        console.log('Message handling completed');
    }
};

    // === Widget Control ===
    window.toggleChat = () => {
        if (!chatbotWidget) return;
        
        const isCurrentlyHidden = chatbotWidget.style.display === 'none' || chatbotWidget.style.display === '';
        chatbotWidget.style.display = isCurrentlyHidden ? 'flex' : 'none';
        
        if (isCurrentlyHidden) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            if (!state.userName && state.isFirstMessage) {
                state.isFirstMessage = false;
                showWelcomeMessage();
            }
        }
    };

    window.closeChat = (event) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (chatbotWidget) {
            chatbotWidget.style.display = 'none';
        }
        clearExistingListeners();
    };

    // === Event Listeners ===
    if (sendButton) {
        sendButton.addEventListener('click', window.sendMessage);
    }
    if (userInputField) {
        userInputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.sendMessage();
            }
        });
    }

    // === Initialization ===
    if (!state.initialized) {
        try {
            await initFirebase();
            if (!window.db) throw new Error('Firestore not initialized');
            
            await firebase.auth().signInAnonymously();
            setupMessageListeners();
            
            if (!state.userName) showWelcomeMessage();
            state.initialized = true;
            
            // Set initial agent name
            setDynamicAgentName();
        } catch (error) {
            console.error("Initialization error:", error);
            return;
        }
    }
});