// Global references
let db;
const favoriteBoats = JSON.parse(localStorage.getItem('favBoats') || '[]');

function formatPriceFromFirestore(boat) {
    if (boat.seasonalPrices && boat.seasonalPrices["July / August"]) {
        return boat.seasonalPrices["July / August"];
    }
    
    if (boat.detailedSpecs && boat.detailedSpecs.Price) {
        return boat.detailedSpecs.Price;
    }

    return "Price on request";
}

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

        // Initialize search functionality
        initializeSearchFunctionality();

        // Initial load
        await displayBoats();
        
    } catch (error) {
        console.error('Initialization error:', error);
        showErrorNotification();
    }
}

function initializeSearchFunctionality() {
    // Add event listeners for search buttons
    const searchButtons = document.querySelectorAll('.search-button');
    searchButtons.forEach(button => {
        button.addEventListener('click', handleSearch);
    });

    // Initialize tab switching
    document.querySelectorAll('.search-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and forms
            document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.yacht-search').forEach(form => {
                form.classList.remove('active');
                form.style.opacity = '0';
            });
            
            // Add active class to clicked tab
            tab.classList.add('active');
            const formType = tab.dataset.tab;
            const activeForm = document.getElementById(`${formType}Search`);
            if (activeForm) {
                activeForm.classList.add('active');
                setTimeout(() => activeForm.style.opacity = '1', 50);
            }
        });
    });

    // Initialize advanced filters
    document.querySelectorAll('.advanced-filters-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const type = this.id.replace('AdvancedBtn', '');
            const filtersSection = document.getElementById(`${type}AdvancedFilters`);
            const isVisible = filtersSection.style.display === 'block';
            
            filtersSection.style.display = isVisible ? 'none' : 'block';
            
            // Update button icon and text
            const icon = this.querySelector('i');
            const span = this.querySelector('span');
            if (icon && span) {
                icon.className = isVisible ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
                span.textContent = isVisible ? 'More Filters' : 'Less Filters';
            }
        });
    });
}

async function handleSearch(e) {
    e.preventDefault();
    const activeTab = document.querySelector('.search-tab.active').dataset.tab;
    const filters = {};

    if (activeTab === 'charter') {
        filters.type = document.getElementById('charter-yachtType')?.value;
        filters.guests = document.getElementById('charter-guests')?.value;
        filters.dates = document.getElementById('charter-dates')?.value;
        filters.price = document.getElementById('charter-price')?.value;
        filters.cabins = document.getElementById('charter-cabins')?.value;
        filters.length = document.getElementById('charter-length')?.value;
    } else if (activeTab === 'sale') {
        filters.type = document.getElementById('sale-yachtType')?.value;
        filters.length = document.getElementById('sale-length')?.value;
        filters.price = document.getElementById('sale-price')?.value;
        filters.year = document.getElementById('sale-year')?.value;
        filters.cabins = document.getElementById('sale-cabins')?.value;
        filters.flag = document.getElementById('sale-flag')?.value;
        filters.builder = document.getElementById('sale-builder')?.value;
    }

    // Remove empty filters
    Object.keys(filters).forEach(key => 
        !filters[key] && delete filters[key]
    );

    await displayBoats(filters);
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

        // Apply base filters
        if (filters.type) {
            query = query.where('detailedSpecs.Class', '==', filters.type);
        }

        if (filters.guests) {
            const [min, max] = filters.guests.split('-').map(Number);
            if (min) query = query.where('detailedSpecs.Guests', '>=', min.toString());
            if (max) query = query.where('detailedSpecs.Guests', '<=', max.toString());
        }

        if (filters.price) {
            let [min, max] = filters.price.split('-').map(val => {
                // Remove non-numeric characters and convert to number
                return parseInt(val.replace(/[^\d]/g, ''));
            });
            
            // Handle special case for "10000+" price range
            if (filters.price.endsWith('+')) {
                query = query.where('seasonalPrices.July / August', '>=', min);
            } else {
                query = query.where('seasonalPrices.July / August', '>=', min)
                           .where('seasonalPrices.July / August', '<=', max);
            }
        }

        const snapshot = await query.get();
        
        if (snapshot.empty) {
            showNoResults(boatsGrid);
            return;
        }

        // Post-query filtering for complex filters
        let filteredBoats = [];
        snapshot.forEach(doc => {
            const boat = doc.data();
            let includeBoat = true;

            // Apply additional filters
            if (filters.length) {
                const [min, max] = filters.length.split('-').map(val => 
                    parseInt(val.replace(/[^\d]/g, '')));
                const boatLength = parseInt(boat.detailedSpecs?.Length);
                if ((min && boatLength < min) || (max && boatLength > max)) {
                    includeBoat = false;
                }
            }

            if (filters.cabins) {
                const [min, max] = filters.cabins.split('-').map(Number);
                const cabins = parseInt(boat.detailedSpecs?.Cabins);
                if ((min && cabins < min) || (max && cabins > max)) {
                    includeBoat = false;
                }
            }

            if (filters.flag && boat.detailedSpecs?.Flag !== filters.flag) {
                includeBoat = false;
            }

            if (filters.builder && boat.detailedSpecs?.Builder !== filters.builder) {
                includeBoat = false;
            }

            if (includeBoat) {
                filteredBoats.push({ id: doc.id, data: () => boat });
            }
        });

        // Update count and display results
        updateYachtCount(filteredBoats.length);
        
        if (filteredBoats.length === 0) {
            showNoResults(boatsGrid);
        } else {
            filteredBoats.forEach(doc => createBoatCard(doc, template, boatsGrid));
        }

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

    // Updated price handling
    const priceElement = clone.querySelector('.price-value');
    const price = formatPriceFromFirestore(boat);
    priceElement.textContent = price;
    priceElement.classList.toggle('price-on-request', price === 'Price on request');

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
    if (mainImage) {
        mainImage.src = src;
    }
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

// Mobile search container handling
let searchContainer;
let minimizeBtn = null;
let handle = null;
let isDragging = false;
let startY = 0;
let startTransformY = 0;

function initializeMobileSearch() {
    searchContainer = document.querySelector('.search-container');
    if (!searchContainer || window.innerWidth > 768) return;

    // Create mobile elements
    if (!handle) {
        handle = document.createElement('div');
        handle.className = 'search-handle';
        searchContainer.insertBefore(handle, searchContainer.firstChild);
    }

    if (!minimizeBtn) {
        minimizeBtn = document.createElement('button');
        minimizeBtn.className = 'minimize-search';
        minimizeBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
        minimizeBtn.setAttribute('aria-label', 'Toggle search panel');
        searchContainer.appendChild(minimizeBtn);
    }

    // Set initial state
    searchContainer.classList.add('minimized');
    searchContainer.style.transform = 'translateY(calc(100% - 60px))';

    // Event listeners
    handle.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    minimizeBtn.addEventListener('click', toggleSearchContainer);
}

function removeMobileSearch() {
    if (!searchContainer || window.innerWidth <= 768) return;

    // Remove mobile elements
    if (handle) handle.remove();
    if (minimizeBtn) minimizeBtn.remove();
    
    // Reset container state
    searchContainer.classList.remove('minimized');
    searchContainer.style.transform = '';
}

function handleTouchStart(e) {
    isDragging = true;
    startY = e.touches[0].clientY;
    startTransformY = searchContainer.style.transform 
        ? parseInt(searchContainer.style.transform.replace(/[^\d-]/g, ''))
        : 0;
}

function handleTouchMove(e) {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;
    const containerHeight = searchContainer.offsetHeight;
    const maxTransform = containerHeight - 60;
    const newTransformY = Math.max(0, Math.min(deltaY + startTransformY, maxTransform));
    searchContainer.style.transform = `translateY(${newTransformY}px)`;
    e.preventDefault();
}

function handleTouchEnd() {
    if (!isDragging) return;
    isDragging = false;

    const currentTransform = searchContainer.style.transform 
        ? parseInt(searchContainer.style.transform.replace(/[^\d-]/g, ''))
        : 0;

    if (currentTransform > searchContainer.offsetHeight / 3) {
        searchContainer.classList.add('minimized');
        minimizeBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
    } else {
        searchContainer.classList.remove('minimized');
        minimizeBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
    }
}

function toggleSearchContainer() {
    const isMinimized = searchContainer.classList.toggle('minimized');
    minimizeBtn.innerHTML = isMinimized 
        ? '<i class="fas fa-chevron-up"></i>' 
        : '<i class="fas fa-chevron-down"></i>';
    
    searchContainer.style.transform = isMinimized 
        ? 'translateY(calc(100% - 60px))' 
        : '';
}

// Handle window resize
function handleResize() {
    if (window.innerWidth <= 768) {
        initializeMobileSearch();
    } else {
        removeMobileSearch();
    }
}

// Initialize application and set up event listeners
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    
    // Initial mobile setup
    handleResize();
    
    // Debounced resize handler
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(handleResize, 250);
    });
});