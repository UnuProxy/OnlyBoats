// Initialize Firebase
let db;

async function initializeApp() {
    try {
        const response = await fetch('/api/firebase-config');
        const firebaseConfig = await response.json();
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        
        // Load boat details after Firebase is initialized
        await loadBoatDetails();
    } catch (error) {
        console.error('Initialization error:', error);
    }
}

async function loadBoatDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const boatId = urlParams.get('id');

    if (!boatId) {
        window.location.href = '/yacht-rental.html';
        return;
    }

    try {
        const doc = await db.collection('boats').doc(boatId).get();
        
        if (!doc.exists) {
            console.error('No boat found with ID:', boatId);
            window.location.href = '/yacht-rental.html';
            return;
        }

        const boat = doc.data();

        // Update main boat info
        document.getElementById('boatName').textContent = boat.name;
        document.getElementById('boatNameDesc').textContent = boat.name;
        document.getElementById('boatNameSpec').textContent = boat.name;
        document.getElementById('boatDescription').textContent = boat.description;

        // Update specifications from detailedSpecs
        const specs = boat.detailedSpecs || {};
        document.getElementById('length').textContent = specs.Length || 'N/A';
        document.getElementById('guests').textContent = specs.Guests || 'N/A';
        document.getElementById('crew').textContent = specs.Crew || 'N/A';
        document.getElementById('built').textContent = specs["Built/Refit"] || 'N/A';
        document.getElementById('cabins').textContent = specs.Cabins || 'N/A';

        // Update seasonal prices
        const prices = boat.seasonalPrices || {};
        document.getElementById('price').textContent = prices["July / August"] || 'N/A';
        document.getElementById('winterLowRate').textContent = prices["May / October"] || 'N/A';
        document.getElementById('winterHighRate').textContent = prices["June / September"] || 'N/A';
        document.getElementById('summerLowRate').textContent = prices["June / September"] || 'N/A';
        document.getElementById('summerHighRate').textContent = prices["July / August"] || 'N/A';

        // Load gallery images
        if (boat.images && boat.images.length > 0) {
            const mainImage = document.getElementById('mainGalleryImage');
            const thumbnailGrid = document.getElementById('thumbnailGrid');
            
            mainImage.src = boat.images[0];
            mainImage.alt = boat.name;

            thumbnailGrid.innerHTML = boat.images.map((img, index) => `
                <div class="thumbnail ${index === 0 ? 'active' : ''}" onclick="changeMainImage('${img}', this)">
                    <img src="${img}" alt="${boat.name} - Image ${index + 1}">
                </div>
            `).join('');
        }

        // Load detailed specifications
        const specsGrid = document.querySelector('.specs-grid');
        if (specsGrid && boat.detailedSpecs) {
            const specEntries = Object.entries(boat.detailedSpecs)
                .filter(([_, value]) => value) // Filter out empty values
                .map(([key, value]) => `
                    <div class="spec-row">
                        <span class="spec-label">${key}</span>
                        <span class="spec-value">${value}</span>
                    </div>
                `).join('');
            
            specsGrid.innerHTML = specEntries;
        }

        // Load amenities if the container exists
        const amenitiesContainer = document.querySelector('#amenities');
        if (amenitiesContainer && boat.amenities) {
            let amenitiesHTML = '';
            
            // Process each amenity category
            Object.entries(boat.amenities).forEach(([category, items]) => {
                const activeAmenities = Object.entries(items)
                    .filter(([_, value]) => value === true)
                    .map(([name]) => name);

                if (activeAmenities.length > 0) {
                    amenitiesHTML += `
                        <div class="amenity-category">
                            <h4>${formatCategoryName(category)}</h4>
                            <div class="amenity-items">
                                ${activeAmenities.map(name => `
                                    <div class="amenity-item">
                                        <i class="fas fa-check"></i>
                                        <span>${formatAmenityName(name)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
            });

            amenitiesContainer.innerHTML = amenitiesHTML;
        }

    } catch (error) {
        console.error('Error loading boat details:', error);
    }
}
// Function to assign boatId to all "Download Brochure" buttons
function assignBoatIdToDownloadButtons() {
    const mainImage = document.getElementById('mainGalleryImage');
    const boatId = mainImage ? mainImage.getAttribute('data-boat-id') : null;

    if (!boatId) {
        console.error('Boat ID not found on mainGalleryImage.');
        return;
    }

    const downloadBtns = document.querySelectorAll('.download-brochure');
    downloadBtns.forEach(button => {
        button.setAttribute('data-boat-id', boatId);
    });
}


// Utility functions
function formatAmenityName(name) {
    return name
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase());
}

function formatCategoryName(name) {
    return name
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .replace(/^./, str => str.toUpperCase());
}

function changeMainImage(src, thumbnail) {
    const mainImage = document.getElementById('mainGalleryImage');
    mainImage.src = src;
    
    document.querySelectorAll('.thumbnail').forEach(thumb => 
        thumb.classList.remove('active')
    );
    thumbnail.classList.add('active');
}
function initializeTouchGallery() {
    const mainImage = document.getElementById('mainGalleryImage');
    let touchstartX = 0;
    let touchendX = 0;
    
    mainImage.addEventListener('touchstart', e => {
        touchstartX = e.changedTouches[0].screenX;
    });

    mainImage.addEventListener('touchend', e => {
        touchendX = e.changedTouches[0].screenX;
        handleSwipe();
    });

    function handleSwipe() {
        const thumbnails = document.querySelectorAll('.thumbnail');
        const activeIndex = Array.from(thumbnails).findIndex(thumb => 
            thumb.classList.contains('active')
        );
        
        if (touchendX < touchstartX - 50 && activeIndex < thumbnails.length - 1) {
            // Swipe left - next image
            thumbnails[activeIndex + 1].click();
        } else if (touchendX > touchstartX + 50 && activeIndex > 0) {
            // Swipe right - previous image
            thumbnails[activeIndex - 1].click();
        }
    }
}


// Tab switching functionality
document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(btn => 
            btn.classList.remove('active')
        );
        document.querySelectorAll('.tab-pane').forEach(pane => 
            pane.classList.remove('active')
        );
        
        button.classList.add('active');
        const tabId = button.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
    });
});

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);