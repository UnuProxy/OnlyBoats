// Global references
let db;
const BOATS_PER_LOAD = 6;
let lastVisibleBoat = null;
let isLoading = false;
let allBoatsLoaded = false;
const favoriteBoats = JSON.parse(localStorage.getItem('favBoats') || '[]');

function extractLength(lengthStr) {
    if (!lengthStr) return 0;
    const match = lengthStr.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
}

function parseLength(lengthStr) {
    if (!lengthStr) return 0;
    const match = lengthStr.toString().match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
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

function parseNumericValue(value) {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    const cleanStr = value.toString().replace(/[^0-9.]/g, '');
    return parseFloat(cleanStr) || 0;
}

function parsePrice(price) {
    if (!price) return 0;
    if (typeof price === 'number') return price;
    const cleanPrice = price.toString().replace(/[€,\s]/g, '');
    return parseFloat(cleanPrice) || 0;
}

function initializeSearchFunctionality() {
    const searchButtons = document.querySelectorAll('.search-button');
    searchButtons.forEach(button => {
        button.addEventListener('click', handleSearch);
    });

    const filtersPanel = document.getElementById('filtersPanel');
    const closeFiltersBtn = document.getElementById('closeFilters');
    const resetButton = document.getElementById('resetFilters');
    
    if (resetButton) {
        resetButton.addEventListener('click', resetFilters);
    }

    if (closeFiltersBtn) {
        closeFiltersBtn.addEventListener('click', () => {
            filtersPanel.classList.remove('active');
        });
    }

    const priceRange = document.getElementById('priceRange');
    const minPrice = document.getElementById('minPrice');
    const maxPrice = document.getElementById('maxPrice');

    if (priceRange) {
        priceRange.addEventListener('input', (e) => {
            const value = e.target.value;
            maxPrice.textContent = value === '10000' ? '€10,000+' : `€${value}`;
        });
    }

    const boatType = document.getElementById('boatType');
    const guests = document.getElementById('guests');
    const priceRangeFilter = document.getElementById('priceRange');
    const cabins = document.getElementById('cabins');

    if (boatType) boatType.addEventListener('change', () => handleSearch());
    if (guests) guests.addEventListener('change', () => handleSearch());
    if (priceRangeFilter) priceRangeFilter.addEventListener('change', () => handleSearch());
    if (cabins) cabins.addEventListener('change', () => handleSearch());
}

function resetFilters() {
    const boatType = document.getElementById('boatType');
    if (boatType) boatType.value = '';

    const guests = document.getElementById('guests');
    if (guests) guests.value = '';

    const priceRange = document.getElementById('priceRange');
    const maxPrice = document.getElementById('maxPrice');
    if (priceRange) {
        priceRange.value = 10000;
        if (maxPrice) maxPrice.textContent = '€10,000+';
    }

    const cabins = document.getElementById('cabins');
    if (cabins) cabins.value = '';

    handleSearch();

    const resetBtn = document.getElementById('resetFilters');
    if (resetBtn) {
        const icon = resetBtn.querySelector('i');
        if (icon) {
            icon.style.transform = 'rotate(360deg)';
            icon.style.transition = 'transform 0.5s ease';
            
            setTimeout(() => {
                icon.style.transform = '';
                icon.style.transition = '';
            }, 500);
        }
    }
}

async function handleSearch(e) {
    if (e) e.preventDefault();
    
    const filters = {
        boatType: document.getElementById('boatType')?.value,
        guests: document.getElementById('guests')?.value,
        priceRange: parseInt(document.getElementById('priceRange')?.value || '10000'),
        cabins: document.getElementById('cabins')?.value
    };

    Object.keys(filters).forEach(key => {
        if (key !== 'priceRange' && !filters[key]) {
            delete filters[key];
        }
    });

    lastVisibleBoat = null;
    allBoatsLoaded = false;
    
    await displayBoats(filters);
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

        if (!isLoadMore) {
            boatsGrid.innerHTML = '';
            lastVisibleBoat = null;
            allBoatsLoaded = false;
            if (loadMoreButton) {
                loadMoreButton.disabled = false;
                loadMoreButton.innerHTML = 'Load More Boats';
            }
        }

        // Create the initial query
        let query = db.collection('boats');
        
        // Get all documents from the collection
        const snapshot = await query.get();
        let boats = [];

        snapshot.forEach(doc => {
            const boat = doc.data();
            
            // Check visibility first - only include visible boats
            // If visible is undefined (for backwards compatibility), consider the boat visible
            if (boat.visible === false) {
                // Skip hidden boats
                return;
            }
            
            let includeBoat = true;

            if (filters.boatType && filters.boatType !== '') {
                const boatClass = boat.detailedSpecs?.Class || '';
                if (boatClass.toLowerCase() !== filters.boatType.toLowerCase()) {
                    includeBoat = false;
                }
            }

            if (includeBoat && filters.guests && filters.guests !== '') {
                const boatGuests = parseNumericValue(boat.detailedSpecs?.Guests);
                const requestedGuests = parseNumericValue(filters.guests);

                if (filters.guests === 'more') {
                    if (boatGuests <= 12) {
                        includeBoat = false;
                    }
                } else if (boatGuests !== requestedGuests) {
                    includeBoat = false;
                }
            }

            if (includeBoat && filters.priceRange) {
                const boatPrice = parsePrice(boat.seasonalPrices?.["July / August"]);
                const maxPrice = parseNumericValue(filters.priceRange);

                if (boatPrice === 0) {
                    includeBoat = false;
                } else if (boatPrice > maxPrice) {
                    includeBoat = false;
                }
            }

            if (includeBoat && filters.cabins && filters.cabins !== '') {
                const boatCabins = parseNumericValue(boat.detailedSpecs?.Cabins);
                
                if (filters.cabins === '5+') {
                    if (boatCabins < 5) {
                        includeBoat = false;
                    }
                } else {
                    const [min, max] = filters.cabins.split('-').map(parseNumericValue);
                    if (boatCabins < min || boatCabins > max) {
                        includeBoat = false;
                    }
                }
            }

            if (includeBoat) {
                boats.push({ id: doc.id, data: boat });
            }
        });

        boats.sort((a, b) => {
            const lengthA = parseLength(a.data.detailedSpecs?.Length);
            const lengthB = parseLength(b.data.detailedSpecs?.Length);
            return lengthA - lengthB;
        });

        const startIndex = isLoadMore ? boats.findIndex(b => b.id === lastVisibleBoat?.id) + 1 : 0;
        const endIndex = startIndex + BOATS_PER_LOAD;
        const boatsToShow = boats.slice(startIndex, endIndex);

        lastVisibleBoat = boatsToShow[boatsToShow.length - 1];

        if (endIndex >= boats.length) {
            allBoatsLoaded = true;
            if (loadMoreButton) {
                loadMoreButton.disabled = true;
                loadMoreButton.innerHTML = 'No More Boats';
            }
        }

        if (boatsToShow.length === 0) {
            if (!isLoadMore) {
                showNoResults(boatsGrid);
            }
            return;
        }

        boatsToShow.forEach(boat => {
            createBoatCard({
                id: boat.id,
                data: () => boat.data
            }, template, boatsGrid);
        });

        if (!isLoadMore) {
            updateYachtCount(boats.length);
        } else {
            const currentCount = parseInt(document.getElementById('yachtCount').textContent) || 0;
            updateYachtCount(Math.min(currentCount + boatsToShow.length, boats.length));
        }

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

    card.setAttribute('data-boat-id', doc.id);

    const img = clone.querySelector('.boat-image');
    img.src = boat.images?.[0] || 'placeholder.jpg';
    img.alt = boat.name;
    img.loading = 'lazy';

    setTimeout(() => {
        card.classList.add('loaded');
    }, 100);

    const favBtn = clone.querySelector('.favorite-btn');
    const isFavorite = favoriteBoats.includes(doc.id);
    favBtn.innerHTML = isFavorite ? 
        '<i class="fas fa-heart"></i>' : 
        '<i class="far fa-heart"></i>';
    favBtn.addEventListener('click', () => toggleFavorite(doc.id, favBtn));

    clone.querySelector('.yacht-name').textContent = boat.name;

    const specs = boat.detailedSpecs || {};
    clone.querySelector('.length').textContent = specs.Length || 'N/A';
    clone.querySelector('.guests').textContent = specs.Guests || 'N/A';
    clone.querySelector('.cabins').textContent = specs.Cabins || 'N/A';
    clone.querySelector('.crew').textContent = specs.Crew || 'N/A';

    const seasonalPrices = boat.seasonalPrices || {};
    clone.querySelector('.low-season').textContent = formatPrice(seasonalPrices["May / October"]);
    clone.querySelector('.mid-season').textContent = formatPrice(seasonalPrices["June / September"]);
    clone.querySelector('.high-season').textContent = formatPrice(seasonalPrices["July / August"]);

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

    button.style.transform = 'scale(1.2)';
    setTimeout(() => button.style.transform = 'scale(1)', 200);

    localStorage.setItem('favBoats', JSON.stringify(favoriteBoats));
}

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

function createLoadMoreButton() {
    const boatsGrid = document.getElementById('boatsGrid');
    if (!boatsGrid) return;

    const loadMoreButton = document.createElement('button');
    loadMoreButton.className = 'load-more-button';
    loadMoreButton.innerHTML = 'Load More Boats';
    loadMoreButton.style.display = 'block';
    loadMoreButton.style.margin = '20px auto';
    loadMoreButton.onclick = () => displayBoats({}, true);
    boatsGrid.parentElement.appendChild(loadMoreButton);
}

async function initializeApp() {
    try {
        const response = await fetch('/api/firebase-config');
        const firebaseConfig = await response.json();
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();

        initializeSearchFunctionality();
        createLoadMoreButton();
        await displayBoats();

    } catch (error) {
        console.error('Initialization error:', error);
        showErrorNotification();
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);