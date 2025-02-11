window.initFirebase = async function() {
  try {
      // Ensure Firebase SDK is loaded
      if (!window.firebase) {
          console.error('Firebase SDK not loaded');
          throw new Error('Firebase SDK not loaded');
      }

      // Check if Firebase is already initialized
      if (!firebase.apps.length) {
          // Fetch Firebase config from your backend API
          const response = await fetch('/api/get-firebase-config');
          
          if (!response.ok) {
              throw new Error(`Failed to fetch Firebase config: ${response.status}`);
          }

          const firebaseConfig = await response.json();

          // Initialize Firebase
          firebase.initializeApp(firebaseConfig);

          // Initialize Firestore and make it globally available
          window.db = firebase.firestore();
          
          console.log('Firebase initialized successfully');
      } else {
          console.log('Firebase already initialized');
          window.db = firebase.firestore();
      }
  } catch (error) {
      console.error('Error initializing Firebase:', error);
      throw error;
  }
};

// Define chat widget functions
window.toggleChat = function() {
  const widget = document.getElementById('chatbot-widget');
  if (widget) {
      widget.style.display = widget.style.display === 'none' || widget.style.display === '' ? 'flex' : 'none';
      if (widget.style.display === 'flex') {
          const messagesContainer = document.getElementById('messages');
          if (messagesContainer) {
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
      }
  }
};

window.closeChat = function(event) {
  if (event) {
      event.preventDefault();
      event.stopPropagation();
  }
  const widget = document.getElementById('chatbot-widget');
  if (widget) {
      widget.style.display = 'none';
  }
};
