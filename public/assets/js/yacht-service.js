// Function to fetch yachts with filters
async function fetchYachts(filters = {}) {
    try {
        // Start with base query
        let query = db.collection('yachts');

        // Apply filters
        if (filters.type && filters.type !== '') {
            query = query.where('type', '==', filters.type);
        }

        if (filters.capacity && filters.capacity !== '') {
            const [min, max] = filters.capacity.split('-');
            if (max) {
                query = query.where('capacity', '>=', parseInt(min))
                           .where('capacity', '<=', parseInt(max));
            } else {
                query = query.where('capacity', '>=', parseInt(min));
            }
        }

        if (filters.priceRange && filters.priceRange !== '') {
            const [min, max] = filters.priceRange.split('-');
            if (max) {
                query = query.where('price', '>=', parseInt(min))
                           .where('price', '<=', parseInt(max));
            } else {
                query = query.where('price', '>=', parseInt(min));
            }
        }

        // Execute query
        const snapshot = await query.get();
        const yachts = [];

        snapshot.forEach(doc => {
            yachts.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return yachts;
    } catch (error) {
        console.error("Error fetching yachts:", error);
        throw error;
    }
}

// Function to render yacht cards
function renderYachts(yachts) {
    const yachtsGrid = document.getElementById('yachtsGrid');
    yachtsGrid.innerHTML = ''; // Clear existing content

    yachts.forEach(yacht => {
        const yachtCard = `
            <div class="col-lg-4 col-md-6">
                <div class="yacht-card">
                    <div class="yacht-image-wrapper">
                        <img src="${yacht.imageUrl}" alt="${yacht.name}" class="yacht-image">
                        <div class="yacht-favorite" onclick="toggleFavorite('${yacht.id}')">
                            <i class="far fa-heart"></i>
                        </div>
                    </div>
                    <div class="yacht-content">
                        <h3 class="yacht-title">${yacht.name}</h3>
                        <div class="yacht-price">€${yacht.price.toLocaleString()} / Day</div>
                        <div class="yacht-specs">
                            <div class="yacht-spec">
                                <i class="fas fa-users"></i>
                                <span class="capacity">${yacht.capacity}</span> Guests
                            </div>
                            <div class="yacht-spec">
                                <i class="fas fa-ruler"></i>
                                <span class="length">${yacht.length}</span>m
                            </div>
                            <div class="yacht-spec">
                                <i class="fas fa-tachometer-alt"></i>
                                <span class="speed">${yacht.speed}</span> Knots
                            </div>
                        </div>
                        <div class="yacht-actions">
                            <a href="yacht-details.html?id=${yacht.id}" class="btn-details">View Details</a>
                            <a href="booking.html?yacht=${yacht.id}" class="btn-book">Book Now</a>
                        </div>
                    </div>
                </div>
            </div>
        `;
        yachtsGrid.insertAdjacentHTML('beforeend', yachtCard);
    });
}

// Function to handle filter submission
function handleFilterSubmit(event) {
    event.preventDefault();
    const filters = {
        type: document.getElementById('yachtType').value,
        capacity: document.getElementById('capacity').value,
        priceRange: document.getElementById('priceRange').value
    };

    document.getElementById('loadingOverlay').style.display = 'flex';
    
    fetchYachts(filters)
        .then(yachts => {
            renderYachts(yachts);
        })
        .catch(error => {
            console.error("Error:", error);
            // Show error message to user
        })
        .finally(() => {
            document.getElementById('loadingOverlay').style.display = 'none';
        });
}

// Function to toggle favorites
function toggleFavorite(yachtId) {
    const favYachts = JSON.parse(localStorage.getItem('favYachts') || '[]');
    const icon = document.querySelector(`[onclick="toggleFavorite('${yachtId}')"] i`);
    
    if (favYachts.includes(yachtId)) {
        // Remove from favorites
        const index = favYachts.indexOf(yachtId);
        favYachts.splice(index, 1);
        icon.classList.remove('fas');
        icon.classList.add('far');
    } else {
        // Add to favorites
        favYachts.push(yachtId);
        icon.classList.remove('far');
        icon.classList.add('fas');
    }
    
    localStorage.setItem('favYachts', JSON.stringify(favYachts));
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    // Initialize form handler
    const filterForm = document.getElementById('filterForm');
    if (filterForm) {
        filterForm.addEventListener('submit', handleFilterSubmit);
    }

    // Load initial yachts
    document.getElementById('loadingOverlay').style.display = 'flex';
    fetchYachts()
        .then(yachts => {
            renderYachts(yachts);
        })
        .catch(error => {
            console.error("Error:", error);
            // Show error message to user
        })
        .finally(() => {
            document.getElementById('loadingOverlay').style.display = 'none';
        });
});