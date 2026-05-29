// customyacht.js - Fixed version with proper jQuery loading
(function() {
    "use strict";

    // Function to initialize when jQuery is ready
    function initializeScript() {
        console.log('Initializing customyacht script with jQuery available');

        // Hide loader immediately if no Firebase
        if (typeof firebase === 'undefined') {
            const loadingOverlay = document.getElementById('loadingOverlay');
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }
        }
        
        // Navbar scrolling
        $(window).scroll(function() {
            var scroll = $(window).scrollTop();
            if (scroll >= 50) {
                $(".navbar").addClass("navbar-fixed");
            } else {
                $(".navbar").removeClass("navbar-fixed");
            }
        });

        // Initialize Select2
        if ($('.select2').length) {
            $('.select2').select2({
                minimumResultsForSearch: -1,
                width: '100%'
            });
        }

        // Smooth Scrolling
        $('a[href*="#"]').not('[href="#"]').click(function(event) {
            if (location.pathname.replace(/^\//, '') === this.pathname.replace(/^\//, '') && 
                location.hostname === this.hostname) {
                var target = $(this.hash);
                target = target.length ? target : $('[name=' + this.hash.slice(1) + ']');
                if (target.length) {
                    event.preventDefault();
                    $('html, body').animate({
                        scrollTop: target.offset().top - 60
                    }, 1000);
                }
            }
        });

        // Yacht cards animation on scroll
        function animateYachtCards() {
            $('.yacht-card').each(function() {
                var cardPosition = $(this).offset().top;
                var topOfWindow = $(window).scrollTop();
                var windowHeight = $(window).height();
                
                if (cardPosition < topOfWindow + windowHeight - 100) {
                    $(this).addClass('yacht-card-visible');
                }
            });
        }

        $(window).scroll(function() {
            animateYachtCards();
        });
        
        // Initialize animation on load
        animateYachtCards();

        // Handle favorite toggle animation
        $('.yacht-favorite').click(function() {
            $(this).toggleClass('active');
        });

        // Handle filters collapse on mobile
        $('.filter-toggle').click(function() {
            $('.filter-box').toggleClass('filter-box-open');
        });

        // ======= FIREBASE FORM SUBMISSION HANDLER =======
        
        // Check if Firebase is available and initialize Firestore
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
            const db = firebase.firestore();
            console.log('Firebase Firestore initialized for form submission');
            
            // Form submission handler
            $('.inquiry-modal-form form').on('submit', function(e) {
                e.preventDefault();
                console.log('Form submission started');
                
                // Show loading overlay
                const loadingOverlay = document.getElementById('loadingOverlay');
                if (loadingOverlay) {
                    loadingOverlay.style.display = 'flex';
                }
                
                // Get form values
                const firstName = $(this).find('input[placeholder="First Name*"]').val().trim();
                const lastName = $(this).find('input[placeholder="Last Name*"]').val().trim();
                const email = $(this).find('input[placeholder="Email Address*"]').val().trim();
                const phone = $(this).find('input[placeholder="Phone Number*"]').val().trim();
                const date = $(this).find('input[type="date"]').val();
                const guests = $(this).find('.inquiry-select-field').val();
                const message = $(this).find('.inquiry-message-field').val().trim();
                const boatName = $('#boatNameInput').val().trim();
                
                // Get promo code from hidden field (if exists)
                let promoCode = '';
                const promoField = document.getElementById('promoCodeInput');
                if (promoField) {
                    promoCode = promoField.value.trim();
                }
                
                console.log('Collected form data:', {
                    firstName, lastName, email, phone, date, guests, boatName, promoCode
                });
                
                // Validate required fields
                if (!firstName || !lastName || !email || !phone || !date || !guests) {
                    alert('Please fill in all required fields.');
                    if (loadingOverlay) {
                        loadingOverlay.style.display = 'none';
                    }
                    return;
                }
                
                // Prepare data for Firebase
                const inquiryData = {
                    firstName: firstName,
                    lastName: lastName,
                    email: email,
                    phone: phone,
                    date: date,
                    guests: parseInt(guests) || 0,
                    message: message,
                    boatName: boatName,
                    promoCode: promoCode, // Include promo code if present
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    source: 'yacht-rental-page',
                    status: 'new'
                };
                
                console.log('Sending to Firebase:', inquiryData);
                
                // Send to Firebase
                db.collection('inquiries').add(inquiryData)
                    .then(function(docRef) {
                        console.log('Document written with ID: ', docRef.id);
                        
                        // Hide loading overlay
                        if (loadingOverlay) {
                            loadingOverlay.style.display = 'none';
                        }
                        
                        // Close modal
                        $('.inquiry-modal').removeClass('active');
                        
                        // Show success message
                        alert('Thank you! Your inquiry has been sent successfully. We will contact you soon.');
                        
                        // Reset form
                        $('.inquiry-modal-form form')[0].reset();
                        
                        // Clear boat name
                        $('#boatNameInput').val('');
                        
                        // If there was a promo code, mark it as used
                        if (promoCode) {
                            localStorage.setItem('promoApplied', 'true');
                            console.log('Promo code marked as applied:', promoCode);
                            
                            // Hide promo banner if it exists
                            const promoBanner = document.getElementById('direct-promo-banner');
                            if (promoBanner) {
                                promoBanner.style.display = 'none';
                            }
                        }
                    })
                    .catch(function(error) {
                        console.error('Error adding document: ', error);
                        
                        // Hide loading overlay
                        if (loadingOverlay) {
                            loadingOverlay.style.display = 'none';
                        }
                        
                        // Show error message
                        alert('Sorry, there was an error sending your inquiry. Please try again or contact us directly.');
                    });
            });
            
            // Add input validation styling
            $('.inquiry-modal-form input, .inquiry-modal-form select, .inquiry-modal-form textarea').on('blur', function() {
                if ($(this).prop('required') && !$(this).val().trim()) {
                    $(this).css('border-color', '#e74c3c');
                } else {
                    $(this).css('border-color', '#ddd');
                }
            });
            
        } else {
            console.log('Firebase not available - form submission will not work');
            
            // Fallback form handler if Firebase is not available
            $('.inquiry-modal-form form').on('submit', function(e) {
                e.preventDefault();
                alert('Form submission is currently unavailable. Please contact us directly at info@justenjoyibizaboats.com');
            });
        }
    }

    // Check if jQuery is loaded, if not wait for it
    function waitForJQuery() {
        if (typeof $ !== 'undefined' && $.fn) {
            // jQuery is loaded, wait for DOM ready
            $(document).ready(function() {
                initializeScript();
            });
        } else {
            // jQuery not loaded yet, wait and try again
            console.log('Waiting for jQuery to load...');
            setTimeout(waitForJQuery, 100);
        }
    }

    // Start waiting for jQuery
    waitForJQuery();

    // Also try with vanilla JavaScript DOM ready as fallback
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            if (typeof $ !== 'undefined') {
                initializeScript();
            }
        });
    } else {
        // DOM already loaded
        if (typeof $ !== 'undefined') {
            initializeScript();
        } else {
            waitForJQuery();
        }
    }
})();

// Debug function to check promo code
window.checkPromoCode = function() {
    const promoField = document.getElementById('promoCodeInput');
    console.log('Promo code field:', promoField);
    console.log('Promo code value:', promoField?.value);
    return promoField?.value;
};