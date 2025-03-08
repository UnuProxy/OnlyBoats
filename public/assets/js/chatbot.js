// Firebase initialisation function for the client
window.initFirebase = async function() {
    if (window.db) {
        return window.db; // Return existing instance if already initialised
    }

    try {
        // Ensure Firebase SDK is loaded
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase SDK not loaded');
        }

        // Fetch Firebase configuration from the server
        const response = await fetch('/api/firebase-config');
        if (!response.ok) {
            throw new Error(`Failed to fetch Firebase config: ${response.status}`);
        }
        
        const firebaseConfig = await response.json();

        // Initialise Firebase if not already done
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        // Initialise Firestore without anonymous sign-in
        window.db = firebase.firestore();
        
        // Check if we already have a persistent UID in localStorage
        const persistentUID = localStorage.getItem('persistent_chat_uid');
        
        if (persistentUID) {
            // Use existing UID for this user
            console.log('Using existing chat UID');
        } else {
            // Create a single persistent ID for this user's browser
            const newUID = `chat_user_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
            localStorage.setItem('persistent_chat_uid', newUID);
            console.log('Created new persistent chat UID');
        }

        return window.db;
    } catch (error) {
        console.error('Firebase initialisation error:', error);
        throw error;
    }
};

function generateUniqueId() {
    return 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
}
  
// Utility function to ensure Firebase is initialised before use
async function ensureFirebaseInitialized() {
    if (!window.db) {
        try {
            await window.initFirebase();
        } catch (error) {
            console.error('Failed to initialise Firebase:', error);
            throw new Error('Database not initialised');
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

    // === Typing Indicator Utility Functions ===
    function showTypingIndicator() {
        if (document.getElementById('typing-indicator')) return;
        const typingMessage = document.createElement('div');
        typingMessage.className = 'message bot typing';
        typingMessage.id = 'typing-indicator';
        typingMessage.innerHTML = `<span class="dot"></span>
                                     <span class="dot"></span>
                                     <span class="dot"></span>`;
        messagesContainer.appendChild(typingMessage);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function removeTypingIndicator() {
        const typingMessage = document.getElementById('typing-indicator');
        if (typingMessage) {
            typingMessage.remove();
        }
    }

    // === State Management ===
    const state = {
        processedMessages: new Set(),
        messageQueue: new Set(),
        initialized: false,
        unsubscribeHandlers: new Set(),
        conversationId: localStorage.getItem('conversationId'),
        userName: localStorage.getItem('userName'),
        userDetailsSubmitted: false,
        isAgentHandling: false,
        isProcessingMessage: false,
        isFirstMessage: localStorage.getItem('welcomeMessageShown') !=='true',
        isWaitingForName: false
    };

    // Generate a new conversationId if none exists
    if (!state.conversationId) {
        state.conversationId = `conv_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        localStorage.setItem('conversationId', state.conversationId);
        localStorage.removeItem('welcomeMessageShown'); 
    }
    
    // === Core Functions ===

    // Display a message in the chat window immediately
    function displayMessage(role, content, messageId) {
        // Check if message already exists in DOM
        if (document.querySelector(`[data-message-id="${messageId}"]`)) {
          return;
        }
      
        // Check if message is already processed
        if (state.processedMessages.has(messageId)) {
          return;
        }
      
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
        
        // Mark as processed
        state.processedMessages.add(messageId);
    }

    // Set up Firestore real-time listeners for conversation status and messages
    function setupMessageListeners() {
        clearExistingListeners();
        
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
      
        const messagesUnsubscribe = window.db.collection('chatConversations')
          .doc(state.conversationId)
          .collection('messages')
          .orderBy('timestamp', 'asc')
          .onSnapshot({ includeMetadataChanges: true }, snapshot => {
            snapshot.docChanges().forEach(change => {
              if (change.type === 'added') {
                // Skip if the message is already being processed
                const messageId = change.doc.data().messageId || change.doc.id;
                if (state.messageQueue.has(messageId)) {
                  return;
                }
                
                // Skip if message is already displayed
                if (state.processedMessages.has(messageId)) {
                  return;
                }
      
                // Skip documents that have pending writes
                if (change.doc.metadata.hasPendingWrites) {
                  return;
                }
      
                const message = change.doc.data();
                
                // Add to processing queue
                state.messageQueue.add(messageId);
                
                // Process the message
                displayMessage(message.role, message.content, messageId);
                
                // Remove from processing queue
                state.messageQueue.delete(messageId);
              }
            });
          });
        
        state.unsubscribeHandlers.add(messagesUnsubscribe);
    }
    
    // Remove any existing listeners
    function clearExistingListeners() {
        state.unsubscribeHandlers.forEach(unsubscribe => unsubscribe());
        state.unsubscribeHandlers.clear();
    }

    // Dynamically set the agent name and image based on time of day
    function setDynamicAgentName() {
        const currentHour = new Date().getHours();
        let agentName = "Just Enjoy Ibiza Assistant";
        let photoSrc = "img/team/default.jpg";
        
        if (currentHour >= 7 && currentHour < 19) {
            agentName = "Julian (Available)";
            photoSrc = "/assets/img/Julian-small.png";
        } else {
            agentName = "Alin (Available)";
            photoSrc = "/assets/img/Alin.png";
        }
        
        if (agentNameElement) agentNameElement.textContent = agentName;
        if (agentPhoto) agentPhoto.src = photoSrc;
    }

    // Show a welcome message to request the user's name
    async function showWelcomeMessage() {
        if (state.isFirstMessage && !localStorage.getItem('welcomeMessageShown')) {
          const welcomeMessage = "Hi there! 👋 I'm here to help you discover the best of Ibiza. What's your name so I can assist you better?";
          const messageId = generateUniqueId();
          
          // Display message immediately
          displayMessage('bot', welcomeMessage, messageId);
          
          // Save to Firestore in background
          saveMessageToFirestore('bot', welcomeMessage, messageId);
          
          state.isWaitingForName = true;
          state.isFirstMessage = false;
          localStorage.setItem('welcomeMessageShown', 'true');
        }
    }

    // Save a message to Firestore and update the conversation document
    async function saveMessageToFirestore(role, content, customMessageId = null) {
        try {
          await ensureFirebaseInitialized();
          
          // Generate a unique ID for this message or use provided one
          const messageId = customMessageId || generateUniqueId();
          
          // First try direct Firestore access since the API endpoint seems to have issues
          try {
            const conversationRef = window.db.collection('chatConversations').doc(state.conversationId);
            const messageRef = conversationRef.collection('messages').doc(messageId);
          
            await messageRef.set({
              role,
              content,
              timestamp: firebase.firestore.FieldValue.serverTimestamp(),
              messageId: messageId
            });
            
            await conversationRef.set({
              lastMessage: content,
              lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
              lastMessageRole: role,
              status: role === 'agent' ? 'agent-handling' : (state.isAgentHandling ? 'agent-handling' : 'active'),
              lastMessageId: messageId,
              browserUid: localStorage.getItem('persistent_chat_uid') || 'unknown'
            }, { merge: true });
            
            return messageId;
          } catch (firestoreError) {
            console.warn('Direct Firestore access failed, trying API:', firestoreError);
            
            // Fall back to API if direct access fails
            const apiUrl = `${BASE_API_URL}/api/save-message`;
            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({ 
                conversationId: state.conversationId,
                messageId: messageId,
                role: role,
                content: content,
                userName: state.userName || null,
                browserUid: localStorage.getItem('persistent_chat_uid') || 'unknown'
              })
            });
            
            if (!response.ok) {
              throw new Error(`API call failed with status: ${response.status}`);
            }
            
            const result = await response.json();
            return result.messageId || messageId;
          }
        } catch (error) {
          console.error('Error saving message:', error);
          // Still return messageId even if saving failed, so we can display the message
          return customMessageId || generateUniqueId();
        }
    }
      
    // Handle agent takeover scenario
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

    // Handle input when waiting for the user's name
    async function handleNameInput(userInput) {
        const name = userInput.trim();
        if (name.length > 0) {
            state.userName = name;
            localStorage.setItem('userName', state.userName);
            state.userDetailsSubmitted = true;
            state.isWaitingForName = false;

            // Update conversation with username
            try {
                await window.db.collection('chatConversations')
                    .doc(state.conversationId)
                    .set({
                        userName: state.userName,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
            } catch (error) {
                console.warn('Failed to update conversation with username:', error);
                // Continue anyway
            }

            // Display bot's response immediately
            const responseMessage = `Nice to meet you, ${state.userName}! How can I help you explore Ibiza today?`;
            const responseId = generateUniqueId();
            displayMessage('bot', responseMessage, responseId);
            
            // Save in background
            saveMessageToFirestore('bot', responseMessage, responseId);
            
            return true;
        }
        
        // Display error message immediately
        const errorMessage = "I didn't quite catch your name. Could you please tell me again?";
        const errorId = generateUniqueId();
        displayMessage('bot', errorMessage, errorId);
        
        // Save in background
        saveMessageToFirestore('bot', errorMessage, errorId);
        
        return false;
    }

    // === Message Handling ===
    window.sendMessage = async () => {
        if (state.isProcessingMessage) return;
        state.isProcessingMessage = true;
        
        if (sendButton) sendButton.disabled = true;

        const userInput = userInputField ? userInputField.value.trim() : '';

        if (!userInput) {
            state.isProcessingMessage = false;
            if (sendButton) sendButton.disabled = false;
            return;
        }

        try {
            // Display user message immediately
            const messageId = generateUniqueId();
            displayMessage('user', userInput, messageId);
            
            // Clear input field immediately
            if (userInputField) userInputField.value = '';
            
            // Save message in background
            saveMessageToFirestore('user', userInput, messageId);

            if (!state.isAgentHandling) {
                if (state.isWaitingForName) {
                    await handleNameInput(userInput);
                } else {
                    showTypingIndicator();
                    try {
                        const apiUrl = `${BASE_API_URL}/api/chat`;
                        
                        const response = await fetch(apiUrl, {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify({ 
                                userMessage: userInput, 
                                conversationId: state.conversationId,
                                userName: state.userName,
                                browserUid: localStorage.getItem('persistent_chat_uid') || null
                            })
                        });

                        removeTypingIndicator();

                        if (!response.ok) {
                            const errorText = await response.text();
                            throw new Error(`HTTP error: ${response.status}`);
                        }
                        
                        const data = await response.json();

                        if (data && data.response) {
                            displayMessage('bot', data.response, data.messageId);
                        } else {
                            throw new Error('Invalid response format from server');
                        }
                    } catch (error) {
                        removeTypingIndicator();
                        const errorMessage = "I'm sorry, I couldn't process your request. Please try again.";
                        const systemMessageId = generateUniqueId();
                        displayMessage('system', errorMessage, systemMessageId);
                        saveMessageToFirestore('system', errorMessage, systemMessageId);
                    }
                }
            }
        } catch (error) {
            console.error('Error in sendMessage:', error);
            const errorMessage = 'Failed to send message. Please try again.';
            const errorId = generateUniqueId();
            displayMessage('system', errorMessage, errorId);
            saveMessageToFirestore('system', errorMessage, errorId);
        } finally {
            state.isProcessingMessage = false;
            if (sendButton) sendButton.disabled = false;
        }
    };

    // === Widget Control ===
    window.toggleChat = () => {
        if (!chatbotWidget) return;
        
        const isCurrentlyHidden = chatbotWidget.style.display === 'none' || chatbotWidget.style.display === '';
        chatbotWidget.style.display = isCurrentlyHidden ? 'flex' : 'none';
        
        // Check for existing welcome message on open
        if (isCurrentlyHidden) {
            // If no messages are visible, load messages from Firestore first
            if (messagesContainer.children.length === 0) {
                window.db.collection('chatConversations')
                    .doc(state.conversationId)
                    .collection('messages')
                    .orderBy('timestamp', 'asc')
                    .get()
                    .then(snapshot => {
                        if (snapshot.empty && !state.userName && state.isFirstMessage) {
                            // No messages in Firestore yet, show welcome message
                            showWelcomeMessage();
                        } else {
                            // Display existing messages
                            snapshot.forEach(doc => {
                                const message = doc.data();
                                if (!state.processedMessages.has(message.messageId)) {
                                    displayMessage(message.role, message.content, message.messageId);
                                }
                            });
                        }
                    })
                    .catch(error => {
                        console.error('Error loading messages:', error);
                        // Show welcome message as fallback
                        if (!state.userName && state.isFirstMessage) {
                            showWelcomeMessage();
                        }
                    });
            } else if (!state.userName && state.isFirstMessage) {
                // If messages container is empty, show welcome message
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

    // === Initialisation ===
    if (!state.initialized) {
        try {
            await initFirebase();
            if (!window.db) throw new Error('Firestore not initialised');
            
            // Set up message listeners
            setupMessageListeners();
            
            // Load existing messages
            try {
                const messagesSnapshot = await window.db.collection('chatConversations')
                    .doc(state.conversationId)
                    .collection('messages')
                    .orderBy('timestamp', 'asc')
                    .get();
                    
                messagesSnapshot.forEach(doc => {
                    const message = doc.data();
                    if (!state.processedMessages.has(message.messageId)) {
                        displayMessage(message.role, message.content, message.messageId);
                    }
                });
                
                // If no messages, show welcome
                if (messagesSnapshot.empty && !state.userName) {
                    showWelcomeMessage();
                }
            } catch (error) {
                console.warn('Failed to load initial messages:', error);
                // Still show welcome message if needed
                if (!state.userName) {
                    showWelcomeMessage();
                }
            }
            
            state.initialized = true;
            setDynamicAgentName();
        } catch (error) {
            console.error("Initialisation error:", error);
            return;
        }
    }
});

