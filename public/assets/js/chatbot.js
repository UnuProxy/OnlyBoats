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

        // Initialise Firestore and sign in anonymously
        window.db = firebase.firestore();
        await firebase.auth().signInAnonymously();

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
                state.processedMessages.add(messageId);
                
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
          const messageId = await saveMessageToFirestore('bot', welcomeMessage);
          state.isWaitingForName = true;
          state.isFirstMessage = false;
          localStorage.setItem('welcomeMessageShown', 'true');
        }
      }

    // Display a message in the chat window
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
      }

    // Save a message to Firestore and update the conversation document
    async function saveMessageToFirestore(role, content) {
        try {
          await ensureFirebaseInitialized();
          const conversationRef = window.db.collection('chatConversations').doc(state.conversationId);
          
          // Generate a unique ID for this message
          const messageId = generateUniqueId();
          
          return await window.db.runTransaction(async (transaction) => {
            // Use the generated messageId instead of letting Firestore auto-generate one
            const messageRef = conversationRef.collection('messages').doc(messageId);
            
            transaction.set(messageRef, {
              role,
              content,
              timestamp: firebase.firestore.FieldValue.serverTimestamp(),
              messageId: messageId
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
          throw error;
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

    // Handle input when waiting for the user’s name
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
        
        if (sendButton) sendButton.disabled = true;

        const userInput = userInputField ? userInputField.value.trim() : '';

        if (!userInput) {
            state.isProcessingMessage = false;
            if (sendButton) sendButton.disabled = false;
            return;
        }

        try {
            const messageId = await saveMessageToFirestore('user', userInput);
            if (!messageId) throw new Error('Failed to save message');
            
            if (userInputField) userInputField.value = '';

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
                                userName: state.userName
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
                            state.processedMessages.add(data.messageId);
                        } else {
                            throw new Error('Invalid response format from server');
                        }
                    } catch (error) {
                        removeTypingIndicator();
                        const errorMessage = "I'm sorry, I couldn't process your request. Please try again.";
                        const systemMessageId = await saveMessageToFirestore('system', errorMessage);
                        displayMessage('system', errorMessage, systemMessageId);
                    }
                }
            }
        } catch (error) {
            console.error('Error in sendMessage:', error);
            await saveMessageToFirestore('system', 'Failed to send message. Please try again.');
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
        
        if (isCurrentlyHidden && !state.userName && !state.processedMessages.size) {
          showWelcomeMessage();
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
            
            await firebase.auth().signInAnonymously();
            setupMessageListeners();
            
            if (!state.userName) showWelcomeMessage();
            state.initialized = true;
            
            setDynamicAgentName();
        } catch (error) {
            console.error("Initialisation error:", error);
            return;
        }
    }
});

