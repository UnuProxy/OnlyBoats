// Global references
let db;
const favoriteBoats = JSON.parse(localStorage.getItem('favBoats') || '[]');

async function initializeApp() {
    try {
        const response = await fetch('/api/firebase-config');
        const firebaseConfig = await response.json();
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();

        // Initialize Select2
        if (window.$ && window.$.fn.select2) {
            $('.select2').select2({
                minimumResultsForSearch: -1,
                width: '100%'
            });
        }

        // Initial load
        await displayBoats();
        
    } catch (error) {
        console.error('Initialization error:', error);
        showErrorNotification();
    }
}

async function displayBoats(filters = {}) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const boatsGrid = document.getElementById('boatsGrid');
    const template = document.getElementById('boat-template');

    try {
        if (!boatsGrid || !template || !loadingOverlay) {
            throw new Error('Required elements missing');
        }

        loadingOverlay.style.display = 'flex';
        boatsGrid.innerHTML = '';

        let query = db.collection('boats');

        // Apply filters with corrected field paths
        if (filters.type) {
            query = query.where('detailedSpecs.Class', '==', filters.type);
        }
        if (filters.capacity) {
            const capacity = parseInt(filters.capacity);
            query = query.where('detailedSpecs.Guests', '==', capacity.toString());
        }
        if (filters.priceRange) {
            const [min, max] = filters.priceRange.split('-').map(Number);
            query = query.where('seasonalPrices.July / August', '>=', min)
                        .where('seasonalPrices.July / August', '<=', max);
        }

        const snapshot = await query.get();
        
        if (snapshot.empty) {
            showNoResults(boatsGrid);
            return;
        }

        snapshot.forEach(doc => createBoatCard(doc, template, boatsGrid));
        updateYachtCount(snapshot.size);

    } catch (error) {
        console.error('Error displaying boats:', error);
        showErrorUI(boatsGrid);
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

function createBoatCard(doc, template, container) {
    const boat = doc.data();
    const clone = template.content.cloneNode(true);

    // Add boat ID to card
    clone.querySelector('.yacht-card').setAttribute('data-boat-id', doc.id);

    // Image handling
    const img = clone.querySelector('.boat-image');
    img.src = boat.images?.[0] || 'placeholder.jpg';
    img.alt = boat.name;

    // Favorite button
    const favBtn = clone.querySelector('.favorite-btn');
    const isFavorite = favoriteBoats.includes(doc.id);
    favBtn.innerHTML = isFavorite ? 
        '<i class="fas fa-heart"></i>' : 
        '<i class="far fa-heart"></i>';
    favBtn.addEventListener('click', () => toggleFavorite(doc.id, favBtn));

    // Boat details
    clone.querySelector('.yacht-name').textContent = boat.name;

    // Specifications
    const specs = boat.detailedSpecs || {};
    clone.querySelector('.length').textContent = specs.Length || 'N/A';
    clone.querySelector('.guests').textContent = specs.Guests || 'N/A';
    clone.querySelector('.crew').textContent = specs.Crew || 'N/A';

    // Price handling
    const priceStr = boat.seasonalPrices?.["July / August"] || "0";
    const price = parseInt(priceStr.replace(/\./g, ''), 10) || 0;
    clone.querySelector('.price-value').textContent = `€${price.toLocaleString()}`;

    // Add view details click handler for new page navigation
    const viewDetailsBtn = clone.querySelector('.btn-details');
    viewDetailsBtn.addEventListener('click', () => {
        window.location.href = `/boat-details.html?id=${doc.id}`;
    });

    container.appendChild(clone);
}

function showBoatDetails(boatId) {
    const modal = document.createElement('div');
    modal.className = 'boat-details-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <button class="close-modal">
                <i class="fas fa-times"></i>
            </button>
            <div class="boat-gallery">
                <div class="main-image">
                    <img id="mainImage" src="" alt="Yacht">
                    <button class="gallery-nav prev">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <button class="gallery-nav next">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
                <div class="thumbnail-grid" id="thumbnailGrid"></div>
            </div>
            <div class="boat-info">
                <h2 id="boatName"></h2>
                <div class="specs-section">
                    <div class="spec-row">
                        <div class="spec-item">
                            <i class="fas fa-ruler"></i>
                            <span id="lengthSpec"></span>
                        </div>
                        <div class="spec-item">
                            <i class="fas fa-users"></i>
                            <span id="guestsSpec"></span>
                        </div>
                        <div class="spec-item">
                            <i class="fas fa-user-shield"></i>
                            <span id="crewSpec"></span>
                        </div>
                    </div>
                </div>
                <div class="description-section">
                    <p id="boatDescription"></p>
                </div>
                <div class="amenities-section" id="amenitiesSection">
                    <h3>Features & Amenities</h3>
                    <div class="amenities-grid"></div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Load boat data
    db.collection('boats').doc(boatId).get().then((doc) => {
        if (doc.exists) {
            const boat = doc.data();
            
            // Populate basic info
            document.getElementById('boatName').textContent = boat.name;
            document.getElementById('lengthSpec').textContent = boat.detailedSpecs?.Length || 'N/A';
            document.getElementById('guestsSpec').textContent = boat.detailedSpecs?.Guests || 'N/A';
            document.getElementById('crewSpec').textContent = boat.detailedSpecs?.Crew || 'N/A';
            document.getElementById('boatDescription').textContent = boat.description;

            // Handle images
            if (boat.images && boat.images.length > 0) {
                const mainImage = document.getElementById('mainImage');
                const thumbnailGrid = document.getElementById('thumbnailGrid');
                let currentImageIndex = 0;
                
                // Set main image
                mainImage.src = boat.images[0];
                
                // Create thumbnails
                thumbnailGrid.innerHTML = boat.images.map((img, index) => `
                    <div class="thumbnail ${index === 0 ? 'active' : ''}" data-index="${index}">
                        <img src="${img}" alt="Yacht view ${index + 1}">
                    </div>
                `).join('');

                // Add thumbnail click handlers
                thumbnailGrid.querySelectorAll('.thumbnail').forEach(thumb => {
                    thumb.addEventListener('click', () => {
                        currentImageIndex = parseInt(thumb.dataset.index);
                        updateMainImage(boat.images[currentImageIndex]);
                        updateThumbnailsActive(currentImageIndex);
                    });
                });

                // Add navigation handlers
                modal.querySelector('.gallery-nav.prev').addEventListener('click', () => {
                    currentImageIndex = (currentImageIndex - 1 + boat.images.length) % boat.images.length;
                    updateMainImage(boat.images[currentImageIndex]);
                    updateThumbnailsActive(currentImageIndex);
                });

                modal.querySelector('.gallery-nav.next').addEventListener('click', () => {
                    currentImageIndex = (currentImageIndex + 1) % boat.images.length;
                    updateMainImage(boat.images[currentImageIndex]);
                    updateThumbnailsActive(currentImageIndex);
                });
            }

            // Display amenities if available
            if (boat.amenities) {
                const amenitiesGrid = modal.querySelector('.amenities-grid');
                Object.entries(boat.amenities).forEach(([category, items]) => {
                    if (typeof items === 'object') {
                        Object.entries(items).forEach(([name, value]) => {
                            if (value === true) {
                                amenitiesGrid.innerHTML += `
                                    <div class="amenity-item">
                                        <i class="fas fa-check"></i>
                                        <span>${formatAmenityName(name)}</span>
                                    </div>
                                `;
                            }
                        });
                    }
                });
            }
        }
    });

    // Close handlers
    modal.querySelector('.close-modal').addEventListener('click', () => {
        modal.remove();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

function updateMainImage(src) {
    const mainImage = document.getElementById('mainImage');
    mainImage.src = src;
}

function updateThumbnailsActive(activeIndex) {
    document.querySelectorAll('.thumbnail').forEach((thumb, index) => {
        thumb.classList.toggle('active', index === activeIndex);
    });
}

function formatAmenityName(name) {
    return name
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase());
}

function toggleFavorite(boatId, button) {
    const index = favoriteBoats.indexOf(boatId);
    const icon = button.querySelector('i');
    
    if (index > -1) {
        favoriteBoats.splice(index, 1);
        icon.classList.replace('fas', 'far');
    } else {
        favoriteBoats.push(boatId);
        icon.classList.replace('far', 'fas');
    }

    // Visual feedback
    button.style.transform = 'scale(1.2)';
    setTimeout(() => button.style.transform = 'scale(1)', 200);

    localStorage.setItem('favBoats', JSON.stringify(favoriteBoats));
}

// UI Helpers
function showNoResults(container) {
    container.innerHTML = `
        <div class="col-12">
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>No boats found</h3>
                <p>Try adjusting your filters</p>
            </div>
        </div>`;
}

function showErrorUI(container) {
    container.innerHTML = `
        <div class="col-12">
            <div class="no-results">
                <i class="fas fa-exclamation-circle text-danger"></i>
                <h3>Error loading boats</h3>
                <p>Please refresh the page</p>
            </div>
        </div>`;
}

function showErrorNotification() {
    const notification = document.createElement('div');
    notification.className = 'error-notification';
    notification.innerHTML = `
        <i class="fas fa-exclamation-triangle"></i>
        <span>Error initializing application</span>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

function updateYachtCount(count) {
    const countElement = document.getElementById('yachtCount');
    if (countElement) {
        countElement.textContent = count;
    }
}

// Filter handling
window.filterBoats = function() {
    const filters = {
        type: document.getElementById('boatType')?.value,
        capacity: document.getElementById('capacity')?.value,
        priceRange: document.getElementById('priceRange')?.value
    };
    displayBoats(filters);
};

// Initialize application
document.addEventListener('DOMContentLoaded', initializeApp)