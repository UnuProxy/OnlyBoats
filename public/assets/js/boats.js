// Global references
let db;
const BOATS_PER_LOAD = 6;
let lastVisibleBoat = null;
let isLoading = false;
let allBoatsLoaded = false;
const favoriteBoats = JSON.parse(localStorage.getItem('favBoats') || '[]');

// Helper function to extract numeric length from string (e.g., "9m" -> 9)
function extractLength(lengthStr) {
    if (!lengthStr) return 0;
    const match = lengthStr.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
}

function formatPriceFromFirestore(boat) {
    if (boat.seasonalPrices && boat.seasonalPrices["July / August"]) {
        return boat.seasonalPrices["July / August"];
    }
    
    if (boat.detailedSpecs && boat.detailedSpecs.Price) {
        return boat.detailedSpecs.Price;
    }

    return "Price on request";
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
            const filtersSection = document.getElementById(`${this.id.replace('AdvancedBtn', '')}AdvancedFilters`);
            const isVisible = filtersSection.classList.contains('active');
            
            filtersSection.classList.toggle('active');
            
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

function initializeInfiniteScroll() {
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        if (scrollTimeout) clearTimeout(scrollTimeout);
        
        scrollTimeout = setTimeout(() => {
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 1000) {
                if (!isLoading && !allBoatsLoaded) {
                    displayBoats({}, true);
                }
            }
        }, 100);
    });
}

async function handleSearch(e) {
    e.preventDefault();
    const activeTab = document.querySelector('.search-tab.active')?.dataset.tab;
    if (!activeTab) return;

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

    // Reset pagination state for new search
    lastVisibleBoat = null;
    allBoatsLoaded = false;
    
    await displayBoats(filters);
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

        // Create and append load more button
        createLoadMoreButton();

        // Initial load
        await displayBoats();
        
        // Initialize infinite scroll
        initializeInfiniteScroll();

    } catch (error) {
        console.error('Initialization error:', error);
        showErrorNotification();
    }
}

function createLoadMoreButton() {
    const boatsGrid = document.getElementById('boatsGrid');
    if (!boatsGrid) return;

    const loadMoreButton = document.createElement('button');
    loadMoreButton.className = 'load-more-button';
    loadMoreButton.innerHTML = 'Load More Boats';
    loadMoreButton.onclick = () => displayBoats({}, true);
    boatsGrid.parentElement.appendChild(loadMoreButton);
}

async function displayBoats(filters = {}, isLoadMore = false) {
    if (isLoading) return;
    
    const loadingOverlay = document.getElementById('loadingOverlay');
    const boatsGrid = document.getElementById('boatsGrid');
    const template = document.getElementById('boat-template');
    const loadMoreButton = document.querySelector('.load-more-button');

    try {
        if (!boatsGrid || !template || !loadingOverlay) {
            throw new Error('Required elements missing');
        }

        isLoading = true;
        loadingOverlay.style.display = 'flex';

        // Clear grid if this is a new search
        if (!isLoadMore) {
            boatsGrid.innerHTML = '';
            lastVisibleBoat = null;
            allBoatsLoaded = false;
            if (loadMoreButton) {
                loadMoreButton.disabled = false;
                loadMoreButton.innerHTML = 'Load More Boats';
            }
        }

        // Create query without length ordering initially
        let query = db.collection('boats');

        // Apply filters
        if (filters.type && filters.type !== '') {
            query = query.where('detailedSpecs.Class', '==', filters.type);
        }

        if (filters.guests && filters.guests !== '') {
            const [min, max] = filters.guests.split('-').map(Number);
            if (min) query = query.where('detailedSpecs.Guests', '>=', min.toString());
            if (max) query = query.where('detailedSpecs.Guests', '<=', max.toString());
        }

        if (filters.price && filters.price !== '') {
            let [min, max] = filters.price.split('-').map(val => {
                return parseInt(val.replace(/[^\d]/g, ''));
            });
            
            if (filters.price.endsWith('+')) {
                query = query.where('seasonalPrices.July / August', '>=', min);
            } else if (min && max) {
                query = query.where('seasonalPrices.July / August', '>=', min)
                           .where('seasonalPrices.July / August', '<=', max);
            }
        }

        // Get all boats for proper sorting
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            allBoatsLoaded = true;
            if (loadMoreButton) {
                loadMoreButton.disabled = true;
                loadMoreButton.innerHTML = 'No More Boats';
            }
            if (!isLoadMore) {
                showNoResults(boatsGrid);
            }
            return;
        }

        // Convert to array and sort by length
        let boats = [];
        snapshot.forEach(doc => {
            const boat = doc.data();
            let includeBoat = true;

            // Apply additional filters
            if (filters.length && filters.length !== '') {
                const [min, max] = filters.length.split('-').map(val => 
                    parseInt(val.replace(/[^\d]/g, '')));
                const boatLength = extractLength(boat.detailedSpecs?.Length);
                if ((min && boatLength < min) || (max && boatLength > max)) {
                    includeBoat = false;
                }
            }

            if (filters.cabins && filters.cabins !== '') {
                const [min, max] = filters.cabins.split('-').map(Number);
                const cabins = parseInt(boat.detailedSpecs?.Cabins);
                if ((min && cabins < min) || (max && cabins > max)) {
                    includeBoat = false;
                }
            }

            if (filters.flag && filters.flag !== '' && boat.detailedSpecs?.Flag !== filters.flag) {
                includeBoat = false;
            }

            if (filters.builder && filters.builder !== '' && boat.detailedSpecs?.Builder !== filters.builder) {
                includeBoat = false;
            }

            if (includeBoat) {
                boats.push({ id: doc.id, data: boat });
            }
        });

        // Sort boats by length
        boats.sort((a, b) => {
            const lengthA = extractLength(a.data.detailedSpecs?.Length);
            const lengthB = extractLength(b.data.detailedSpecs?.Length);
            return lengthA - lengthB;
        });

        // Handle pagination
        const startIndex = isLoadMore ? boats.findIndex(b => b.id === lastVisibleBoat?.id) + 1 : 0;
        if (startIndex === -1) {
            // If we can't find the last visible boat, start from beginning
            lastVisibleBoat = null;
            return await displayBoats(filters, false);
        }

        const boatsToShow = boats.slice(startIndex, startIndex + BOATS_PER_LOAD);
        
        // Update last visible boat
        lastVisibleBoat = boatsToShow[boatsToShow.length - 1];

        // Check if all boats are loaded
        if (startIndex + BOATS_PER_LOAD >= boats.length) {
            allBoatsLoaded = true;
            if (loadMoreButton) {
                loadMoreButton.disabled = true;
                loadMoreButton.innerHTML = 'No More Boats';
            }
        }

        // Update count
        if (!isLoadMore) {
            updateYachtCount(boats.length);
        } else {
            const currentCount = parseInt(document.getElementById('yachtCount').textContent) || 0;
            updateYachtCount(currentCount + boatsToShow.length);
        }
        
        // Display boats
        boatsToShow.forEach(boat => {
            createBoatCard({
                id: boat.id,
                data: () => boat.data
            }, template, boatsGrid);
        });

    } catch (error) {
        console.error('Error displaying boats:', error);
        showErrorUI(boatsGrid);
    } finally {
        isLoading = false;
        loadingOverlay.style.display = 'none';
    }
}

function createBoatCard(doc, template, container) {
    const boat = doc.data();
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.yacht-card');

    // Add boat ID to card
    card.setAttribute('data-boat-id', doc.id);

    // Image handling
    const img = clone.querySelector('.boat-image');
    img.src = boat.images?.[0] || 'placeholder.jpg';
    img.alt = boat.name;
    img.loading = 'lazy';

    // Add animation class after a small delay
    setTimeout(() => {
        card.classList.add('loaded');
    }, 100);

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
    clone.querySelector('.cabins').textContent = specs.Cabins || 'N/A';
    clone.querySelector('.crew').textContent = specs.Crew || 'N/A';

    // Seasonal prices
    const seasonalPrices = boat.seasonalPrices || {};
    clone.querySelector('.low-season').textContent = formatPrice(seasonalPrices["May / October"]);
    clone.querySelector('.mid-season').textContent = formatPrice(seasonalPrices["June / September"]);
    clone.querySelector('.high-season').textContent = formatPrice(seasonalPrices["July / August"]);

    // Add view details click handler
    const viewDetailsBtn = clone.querySelector('.btn-view');
    viewDetailsBtn.addEventListener('click', () => {
        window.location.href = `/boat-details.html?id=${doc.id}`;
    });

    container.appendChild(clone);
}

function formatPrice(price) {
    if (!price) return 'On request';
    return `€${price.toLocaleString()}`;
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