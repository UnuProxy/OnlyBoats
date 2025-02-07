// Initialize Stripe and global variables
const stripe = Stripe("pk_live_51QmynnDMhcF3s2QS90R7gQ0zvmO3OGrBM8H528l1zih6Hogdfy8MVb3yvOBfRbbjdp8N0EyUiN853AfxDby6Ihd5002Ma68UcI");

// Global variables
let cart = [];
let allProducts = [];
const ITEMS_PER_PAGE = 9;
let currentPage = 1;
let filteredProducts = [];

// Category specific subcategories
const subCategories = {
    drinks: ['Wine', 'Spirits', 'Soft Drinks', 'Cocktails', 'Beer'],
    packages: ['Standard', 'Premium', 'VIP', 'Custom'],
    snacks: ['Chips', 'Nuts', 'Fruits', 'Sweets', 'Crackers'],
    merchandise: ['T-Shirts', 'Caps', 'Beach Towels', 'Accessories', 'Souvenirs']
};

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}




// Update the mobile filter toggle functionality
function initializeMobileFilters() {
    const filterToggle = document.querySelector('.mobile-filter-toggle button');
    const filterContent = document.getElementById('mobileFilters');

    if (filterToggle && filterContent) {
        const bsCollapse = new bootstrap.Collapse(filterContent, {
            toggle: false
        });

        filterToggle.addEventListener('click', () => {
            bsCollapse.toggle();
        });
    }
}

// Updated DOMContentLoaded event
document.addEventListener('DOMContentLoaded', () => {
    loadSavedCart();
    
    // Initialize filters
    initializeMobileFilters();
    
    // Load products and initialize filters
    loadProducts().then(() => {
        const activeTab = document.querySelector('.tab-pane.active');
        if (activeTab) {
            updateSubcategoryFilter(activeTab.id);
            applyFilters();
        }
    });

    // Initialize controls
    initializeControls();
    initializeMobileCart();

    // Initialize checkout button
    const checkoutButton = document.querySelector('.btn-checkout');
    if (checkoutButton) {
        checkoutButton.addEventListener('click', openCheckoutModal);
    }

    // Update tab change listeners
    document.querySelectorAll('[data-bs-toggle="pill"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', () => {
            const activeTab = document.querySelector('.tab-pane.active');
            if (activeTab) {
                updateSubcategoryFilter(activeTab.id);
                currentPage = 1;
                applyFilters();
            }
        });
    });
});

// Update the mobile cart interaction
function initializeMobileCart() {
    const orderSummary = document.getElementById('orderSummary');
    if (!orderSummary || window.innerWidth > 768) return;

    // Remove existing pull-up handle if any
    const existingHandle = orderSummary.querySelector('.pull-up-handle');
    if (existingHandle) {
        existingHandle.remove();
    }

    // Add pull-up handle
    const pullUpHandle = document.createElement('div');
    pullUpHandle.className = 'pull-up-handle';
    pullUpHandle.innerHTML = '<div class="handle-bar"></div>';
    orderSummary.insertBefore(pullUpHandle, orderSummary.firstChild);

    let startY = 0;
    let isExpanded = false;

    // Set initial position
    orderSummary.style.transform = 'translateY(calc(100% - 80px))';

    // Simple click toggle
    pullUpHandle.addEventListener('click', () => {
        isExpanded = !isExpanded;
        if (isExpanded) {
            orderSummary.style.transform = 'translateY(0)';
        } else {
            orderSummary.style.transform = 'translateY(calc(100% - 80px))';
        }
        orderSummary.classList.toggle('expanded', isExpanded);
    });

    // Touch handlers for drag
    orderSummary.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        orderSummary.style.transition = 'none';
    });

    orderSummary.addEventListener('touchmove', (e) => {
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - startY; // Changed to currentY - startY for correct direction

        // Calculate the new position
        const currentTranslateY = isExpanded ? 0 : window.innerHeight - 80;
        const newPosition = Math.max(0, Math.min(window.innerHeight - 80, currentTranslateY + deltaY));
        
        orderSummary.style.transform = `translateY(${newPosition}px)`;
    });

    orderSummary.addEventListener('touchend', () => {
        orderSummary.style.transition = 'transform 0.3s ease-in-out';
        const rect = orderSummary.getBoundingClientRect();
        const threshold = window.innerHeight / 2;

        isExpanded = rect.top < threshold;

        if (isExpanded) {
            orderSummary.style.transform = 'translateY(0)';
        } else {
            orderSummary.style.transform = 'translateY(calc(100% - 80px))';
        }
        orderSummary.classList.toggle('expanded', isExpanded);
    });

    // Update the cart's position when items change
    const originalUpdateCartDisplay = window.updateCartDisplay;
    window.updateCartDisplay = function() {
        if (originalUpdateCartDisplay) {
            originalUpdateCartDisplay();
        }
        if (window.innerWidth <= 768) {
            if (!isExpanded) {
                orderSummary.style.transform = 'translateY(calc(100% - 80px))';
            }
        }
    };
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializeMobileCart);

// Reinitialize on resize
window.addEventListener('resize', () => {
    initializeMobileCart();
});


// Filter functions
function applyFilters() {
    const activeTab = document.querySelector('.tab-pane.active');
    if (!activeTab) return;
    
    const currentCategory = activeTab.id;
    
    // Get filter values with null checks
    const priceRange = document.getElementById('priceFilter')?.value || '';
    const sortBy = document.getElementById('sortFilter')?.value || '';
    const searchTerm = document.getElementById('searchFilter')?.value?.toLowerCase() || '';
    const subcategory = document.getElementById('subCategoryFilter')?.value || '';
    
    // Filter products
    filteredProducts = allProducts.filter(product => {
        if (product.category !== currentCategory) return false;
        
        if (priceRange) {
            const [min, max] = priceRange.split('-').map(Number);
            if (max && (product.price < min || product.price > max)) return false;
            if (!max && product.price < min) return false;
        }
        
        if (searchTerm && !product.name.toLowerCase().includes(searchTerm)) return false;
        if (subcategory && product.subcategory?.toLowerCase() !== subcategory) return false;
        
        return true;
    });
    
    // Apply sorting
    if (sortBy) {
        filteredProducts.sort((a, b) => {
            switch (sortBy) {
                case 'price-asc': return a.price - b.price;
                case 'price-desc': return b.price - a.price;
                case 'name-asc': return a.name.localeCompare(b.name);
                case 'name-desc': return b.name.localeCompare(a.name);
                default: return 0;
            }
        });
    }
    
    currentPage = 1;
    renderProducts();
}

function updateSubcategoryFilter(category) {
    const subcategorySelect = document.getElementById('subCategoryFilter');
    if (!subcategorySelect) return;

    subcategorySelect.innerHTML = '<option value="">All Categories</option>';
    
    const relevantSubcategories = subCategories[category] || [];
    relevantSubcategories.forEach(sub => {
        subcategorySelect.insertAdjacentHTML('beforeend', 
            `<option value="${sub.toLowerCase()}">${sub}</option>`);
    });
}

function renderProducts() {
    const activeTab = document.querySelector('.tab-pane.active');
    if (!activeTab) return;
    
    const container = activeTab.querySelector('.row');
    if (!container) return;

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageProducts = filteredProducts.slice(startIndex, endIndex);

    container.innerHTML = pageProducts.map(product => 
        activeTab.id === 'merchandise' ? 
        createMerchandiseHtml(product) : 
        product.category === 'packages' ?
        createPackageHtml(product) :
        createProductHtml(product)
    ).join('');

    renderPagination(activeTab.id, filteredProducts.length);
}

function renderPagination(category, totalItems) {
    // Find the active tab's pagination container
    const activeTab = document.querySelector('.tab-pane.active');
    if (!activeTab) return;
    
    const paginationContainer = activeTab.querySelector('.pagination-container');
    if (!paginationContainer) return;

    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    
    let paginationHtml = `
        <button class="pagination-button" ${currentPage === 1 ? 'disabled' : ''} 
                onclick="changePage(${currentPage - 1})">
            <i class="fas fa-chevron-left"></i>
        </button>
    `;
    
    for (let i = 1; i <= totalPages; i++) {
        paginationHtml += `
            <button class="pagination-button ${currentPage === i ? 'active' : ''}" 
                    onclick="changePage(${i})">${i}</button>
        `;
    }
    
    paginationHtml += `
        <button class="pagination-button" ${currentPage === totalPages ? 'disabled' : ''} 
                onclick="changePage(${currentPage + 1})">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;
    
    paginationContainer.innerHTML = paginationHtml;
}

function changePage(page) {
    const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderProducts();
}// Submit Order Function
async function submitOrder() {
    const fullName = document.getElementById("fullName").value.trim();
    const boatName = document.getElementById("boatName").value.trim();
    const rentalCompany = document.getElementById("rentalCompany").value.trim();
    const phoneNumber = document.getElementById("phoneNumber").value.trim();
    const email = document.getElementById("email").value.trim();
    const orderDate = document.getElementById("orderDate").value;
    const paymentMethod = document.getElementById("paymentMethod").value;
    const specialNotes = document.getElementById("specialNotes").value.trim();

    if (!fullName || !boatName || !phoneNumber || !email) {
        alert("Please fill in required fields: Full Name, Boat Name, Phone, Email.");
        return;
    }

    const submitButton = document.querySelector('.btn-primary');
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    try {
        // Calculate total
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        const orderData = {
            cart: cart.map(item => ({
                id: item.id,
                name: item.name,
                price: Number(item.price),
                quantity: Number(item.quantity),
                size: item.size // Include size for merchandise items
            })),
            customerEmail: email,
            boatName,
            orderDate,
            paymentMethod,
            fullName,
            rentalCompany,
            phoneNumber,
            specialNotes,
            total: total
        };

        console.log('Sending order data:', orderData);

        const functionUrl = 'https://us-central1-crm-boats.cloudfunctions.net/createCheckoutSession';
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            mode: 'cors',
            body: JSON.stringify(orderData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || errorData.error || 'Payment session creation failed');
        }

        const data = await response.json();
        if (!data.sessionId) {
            throw new Error('Invalid response from server: missing sessionId');
        }

        const result = await stripe.redirectToCheckout({ sessionId: data.sessionId });
        if (result.error) {
            throw new Error(result.error.message);
        }

    } catch (error) {
        console.error('Payment error:', error);
        alert(`Payment failed: ${error.message}. Please try again.`);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Confirm Order';
    }
}

// Open Checkout Modal
function openCheckoutModal() {
    const checkoutItems = document.getElementById("checkoutItems");
    const checkoutTotal = document.getElementById("checkoutTotal");
    checkoutItems.innerHTML = "";

    let total = 0;
    cart.forEach((item) => {
        total += item.price * item.quantity;
        const itemHtml = `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                ${item.name}${item.size ? ` (${item.size})` : ''} (x${item.quantity})
                <span>€${(item.price * item.quantity).toFixed(2)}</span>
            </li>
        `;
        checkoutItems.insertAdjacentHTML("beforeend", itemHtml);
    });

    checkoutTotal.textContent = `€${total.toFixed(2)}`;
    const checkoutModal = new bootstrap.Modal(document.getElementById("checkoutModal"));
    checkoutModal.show();
}


// Update the initializeControls function
function initializeControls() {
    // Only add the event listeners if they haven't been added already
    if (document.body.dataset.controlsInitialised === 'true') {
        return;
    }
    
    let lastTouchTime = 0;
    
    function handleEvent(e) {
        // If a touch event occurred, record its time
        if (e.type === 'touchstart') {
            lastTouchTime = Date.now();
        } else if (e.type === 'click') {
            // If a click event fires shortly after a touch, ignore it
            if (Date.now() - lastTouchTime < 500) { // 500ms threshold (adjustable)
                return;
            }
        }
    
        const target = e.target;
    
        // Quantity decrease
        if (target.closest(".minus")) {
            e.preventDefault();
            const input = target.closest(".quantity-control").querySelector(".qty-input");
            let currentValue = parseInt(input.value) || 0;
            input.value = Math.max(0, currentValue - 1);
            toggleAddButton(input);
            return;
        }
    
        // Quantity increase
        if (target.closest(".plus")) {
            e.preventDefault();
            const input = target.closest(".quantity-control").querySelector(".qty-input");
            const maxStock = parseInt(input.dataset.maxStock);
            let currentValue = parseInt(input.value) || 0;
            if (currentValue < maxStock) {
                input.value = currentValue + 1;
                toggleAddButton(input);
            }
            return;
        }
    
        // Add to cart
        if (target.closest(".add-to-cart")) {
            e.preventDefault();
            const itemElement = target.closest(".catering-item") || target.closest(".merchandise-item");
            if (itemElement) {
                addToCart(itemElement);
            }
            return;
        }
    
        // Remove from cart
        if (target.closest(".remove-item")) {
            e.preventDefault();
            const summaryItem = target.closest(".summary-item");
            if (summaryItem) {
                const productId = summaryItem.dataset.productId;
                removeFromCart(productId);
            }
            return;
        }
    
        // Size selection
        if (target.closest(".size-option")) {
            e.preventDefault();
            const sizeOptions = target.closest(".size-selector").querySelectorAll(".size-option");
            sizeOptions.forEach(opt => opt.classList.remove("selected"));
            target.closest(".size-option").classList.add("selected");
            return;
        }
    }
    
    // Add the event listeners with the debounce check in place
    document.addEventListener('touchstart', handleEvent);
    document.addEventListener('click', handleEvent);
    
    document.body.dataset.controlsInitialised = 'true';
}

initializeControls();



// New functions for filters
function initializeFilters() {
    // Desktop filter listeners
    document.getElementById('priceFilter')?.addEventListener('change', applyFilters);
    document.getElementById('sortFilter')?.addEventListener('change', applyFilters);
    document.getElementById('searchFilter')?.addEventListener('input', debounce(applyFilters, 300));
    document.getElementById('subCategoryFilter')?.addEventListener('change', applyFilters);

    // Mobile filter listeners
    document.getElementById('priceFilterMobile')?.addEventListener('change', applyMobileFilters);
    document.getElementById('sortFilterMobile')?.addEventListener('change', applyMobileFilters);
    document.getElementById('searchFilterMobile')?.addEventListener('input', debounce(applyMobileFilters, 300));
    document.getElementById('subCategoryFilterMobile')?.addEventListener('change', applyMobileFilters);

    // Initialize mobile filter drawer
    const filterDrawer = document.getElementById('filterDrawer');
    if (filterDrawer) {
        filterDrawer.addEventListener('show.bs.offcanvas', syncFiltersToMobile);
    }
}

function syncFiltersToMobile() {
    // Sync desktop filters to mobile
    const filterPairs = [
        ['priceFilter', 'priceFilterMobile'],
        ['sortFilter', 'sortFilterMobile'],
        ['searchFilter', 'searchFilterMobile'],
        ['subCategoryFilter', 'subCategoryFilterMobile']
    ];

    filterPairs.forEach(([desktopId, mobileId]) => {
        const desktop = document.getElementById(desktopId);
        const mobile = document.getElementById(mobileId);
        if (desktop && mobile) {
            mobile.value = desktop.value;
        }
    });
}

function applyMobileFilters() {
    // Sync mobile filters to desktop before applying
    const filterPairs = [
        ['priceFilterMobile', 'priceFilter'],
        ['sortFilterMobile', 'sortFilter'],
        ['searchFilterMobile', 'searchFilter'],
        ['subCategoryFilterMobile', 'subCategoryFilter']
    ];

    filterPairs.forEach(([mobileId, desktopId]) => {
        const mobile = document.getElementById(mobileId);
        const desktop = document.getElementById(desktopId);
        if (mobile && desktop) {
            desktop.value = mobile.value;
        }
    });

    applyFilters();
}

function clearFilters() {
    // Clear both desktop and mobile filter values
    const filterIds = [
        'priceFilter', 'sortFilter', 'searchFilter', 'subCategoryFilter',
        'priceFilterMobile', 'sortFilterMobile', 'searchFilterMobile', 'subCategoryFilterMobile'
    ];

    filterIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.value = '';
        }
    });

    // Apply filters after clearing
    applyFilters();

    // Close mobile filter interface if open (for mobile viewports)
    if (window.innerWidth <= 768) {
        // Try to close offcanvas filter drawer if it exists
        const filterDrawer = document.getElementById('filterDrawer');
        if (filterDrawer) {
            const bsOffcanvas = bootstrap.Offcanvas.getInstance(filterDrawer);
            if (bsOffcanvas) {
                bsOffcanvas.hide();
                return; // If offcanvas exists and is hidden, exit the function
            }
        }
        // Otherwise, try to close mobile filters using collapse if available
        const mobileFilters = document.getElementById('mobileFilters');
        if (mobileFilters) {
            const bsCollapse = bootstrap.Collapse.getInstance(mobileFilters);
            if (bsCollapse) {
                bsCollapse.hide();
            }
        }
    }
}


// Keep your existing toggleAddButton function
function toggleAddButton(input) {
    const addButton = input.closest(".catering-item, .merchandise-item")?.querySelector(".add-to-cart");
    if (addButton) {
        addButton.disabled = (parseInt(input.value) === 0);
    }
}

// Load Products
async function loadProducts() {
    try {
        console.log("🔥 Fetching products from API...");
        const response = await fetch("/api/products");
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        allProducts = await response.json();
        filteredProducts = [...allProducts];

        // Get all container references
        const containers = {
            drinks: document.querySelector("#drinks .row"),
            packages: document.querySelector("#packages .row"),
            snacks: document.querySelector("#snacks .row"),
            merchandise: document.querySelector("#merchandise .row")
        };

        // Clear containers
        Object.values(containers).forEach(container => {
            if (container) container.innerHTML = "";
        });

        // Process images first
        for (const product of allProducts) {
            if (!product.isActive) continue;

            if (product.imageUrl && product.imageUrl.includes('firebasestorage')) {
                try {
                    const imgResponse = await fetch(product.imageUrl);
                    if (!imgResponse.ok) {
                        product.imageUrl = '/assets/img/placeholder.jpg';
                    }
                } catch (error) {
                    console.error(`Failed to load image for ${product.name}:`, error);
                    product.imageUrl = '/assets/img/placeholder.jpg';
                }
            }
        }

        // Set initial category to 'drinks' and render
        const defaultCategory = 'drinks';
        updateSubcategoryFilter(defaultCategory);
        filteredProducts = allProducts.filter(product => product.category === defaultCategory);
        renderProducts(defaultCategory);
        updateCartDisplay();

    } catch (error) {
        console.error("🚨 Error loading products:", error);
    }
}

// Create Product HTML
function createProductHtml(product) {
    return `
        <div class="col-md-4 mb-4">
            <div class="catering-item" data-product-id="${product.id}" data-stock="${product.stock}">
                <div class="item-image">
                    <img src="${product.imageUrl}" 
                         alt="${product.name}"
                         onerror="this.onerror=null; this.src='/assets/img/placeholder.jpg';"
                         loading="lazy">
                </div>
                <div class="item-content">
                    <h4>${product.name}</h4>
                    <p>${product.description || "No description available"}</p>
                    <div class="item-price">€${product.price.toFixed(2)}</div>
                    <div class="item-actions">
                        <div class="quantity-control">
                            <button class="qty-btn minus" type="button"><i class="fas fa-minus"></i></button>
                            <input type="number" value="0" min="0" class="qty-input" data-max-stock="${product.stock}">
                            <button class="qty-btn plus" type="button"><i class="fas fa-plus"></i></button>
                        </div>
                        <button class="add-to-cart" disabled type="button">Add</button>
                    </div>
                    <p class="stock-info">Available: ${product.stock}</p>
                </div>
            </div>
        </div>
    `;
}

// Create Package HTML
function createPackageHtml(product) {
    return `
        <div class="col-md-6 mb-4">
            <div class="package-card" data-product-id="${product.id}">
                <div class="package-header">
                    <h3>${product.name}</h3>
                    <div class="package-price">€${product.price.toFixed(2)}</div>
                </div>
                <div class="package-content">
                    <ul class="package-features">
                        ${product.contents ? product.contents.split("\n").map(item => 
                            `<li><i class="fas fa-check"></i> ${item}</li>`
                        ).join("") : ""}
                    </ul>
                    <button class="btn-package" type="button">Select Package</button>
                </div>
            </div>
        </div>
    `;
}

// Create Merchandise HTML
function createMerchandiseHtml(product) {
    return `
        <div class="col-md-4 mb-4">
            <div class="merchandise-item" data-product-id="${product.id}" data-stock="${product.stock}">
                <div class="item-image">
                    <img src="${product.imageUrl}" 
                         alt="${product.name}"
                         onerror="this.onerror=null; this.src='/assets/img/placeholder.jpg';"
                         loading="lazy">
                </div>
                <div class="item-content">
                    <h4>${product.name}</h4>
                    <p>${product.description || "No description available"}</p>
                    <div class="item-price">€${product.price.toFixed(2)}</div>
                    <div class="size-selector">
                        ${(product.sizes || ['S', 'M', 'L', 'XL']).map(size => `
                            <div class="size-option" data-size="${size}">${size}</div>
                        `).join('')}
                    </div>
                    <div class="item-actions">
                        <div class="quantity-control">
                            <button class="qty-btn minus" type="button"><i class="fas fa-minus"></i></button>
                            <input type="number" value="0" min="0" class="qty-input" data-max-stock="${product.stock}">
                            <button class="qty-btn plus" type="button"><i class="fas fa-plus"></i></button>
                        </div>
                        <button class="add-to-cart" disabled type="button">Add</button>
                    </div>
                    <p class="stock-info">Available: ${product.stock}</p>
                </div>
            </div>
        </div>
    `;
}// Add to Cart
function addToCart(itemElement) {
    const productId = itemElement.dataset.productId;
    const stock = parseInt(itemElement.dataset.stock);
    const quantity = parseInt(itemElement.querySelector(".qty-input").value);
    const priceText = itemElement.querySelector(".item-price").textContent.replace("€", "");
    const price = parseFloat(priceText);

    // Check for size selection if it's a merchandise item
    let selectedSize = null;
    const sizeSelector = itemElement.querySelector(".size-selector");
    if (sizeSelector) {
        const selectedSizeElement = sizeSelector.querySelector(".size-option.selected");
        if (!selectedSizeElement) {
            alert("Please select a size");
            return;
        }
        selectedSize = selectedSizeElement.dataset.size;
    }

    if (quantity > 0 && quantity <= stock) {
        const existingItem = cart.find(p => 
            p.id === productId && (!selectedSize || p.size === selectedSize)
        );

        if (existingItem) {
            existingItem.quantity += quantity;
            if (existingItem.quantity > stock) {
                existingItem.quantity = stock;
            }
        } else {
            cart.push({
                id: productId,
                name: itemElement.querySelector("h4").textContent,
                price: price,
                quantity: quantity,
                size: selectedSize
            });
        }

        updateCartDisplay();
        saveCart();
        itemElement.querySelector(".qty-input").value = 0;
        toggleAddButton(itemElement.querySelector(".qty-input"));
    }
}

// Remove from Cart
function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    updateCartDisplay();
    saveCart();
}

// Update Cart Display
function updateCartDisplay() {
    const summaryContainer = document.querySelector(".summary-items");
    const totalElement = document.querySelector(".total-amount");
    const itemCountElement = document.querySelector(".item-count");
    const checkoutTotal = document.getElementById("checkoutTotal");
    summaryContainer.innerHTML = "";

    let total = 0;
    let itemCount = 0;

    cart.forEach((item) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        itemCount += item.quantity;

        const itemHtml = `
            <div class="summary-item" data-product-id="${item.id}">
                <div class="item-info">
                    <span class="item-name">${item.name}${item.size ? ` (${item.size})` : ''}</span>
                    <span class="item-quantity">x${item.quantity}</span>
                </div>
                <div class="item-price">€${itemTotal.toFixed(2)}</div>
                <button class="remove-item" type="button">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        summaryContainer.insertAdjacentHTML("beforeend", itemHtml);
    });

    const formattedTotal = `€${total.toFixed(2)}`;
    totalElement.textContent = formattedTotal;
    if (checkoutTotal) {
        checkoutTotal.textContent = formattedTotal;
    }
    itemCountElement.textContent = `${itemCount} items`;

    const orderSummary = document.getElementById("orderSummary");
    const checkoutButton = document.querySelector(".btn-checkout");
    
    if (cart.length > 0) {
        orderSummary.classList.add("active");
        checkoutButton.removeAttribute("disabled");
    } else {
        orderSummary.classList.remove("active");
        checkoutButton.setAttribute("disabled", "disabled");
    }
}

// Save Cart to localStorage
function saveCart() {
    localStorage.setItem("cart", JSON.stringify(cart));
}

// Load cart from localStorage
function loadSavedCart() {
    const savedCart = localStorage.getItem("cart");
    if (savedCart) {
        try {
            cart = JSON.parse(savedCart);
            updateCartDisplay();
        } catch (error) {
            console.error("Error loading saved cart:", error);
            cart = [];
        }
    }
}



// Initialize everything on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize core functionality
    initializeControls();
    
    // Load saved cart and products
    loadSavedCart();
    loadProducts().then(() => {
        const activeTab = document.querySelector('.nav-link.active');
        const currentCategory = activeTab?.getAttribute('data-bs-target')?.replace('#', '') || 'drinks';
        updateSubcategoryFilter(currentCategory);
        applyFilters();
    });

    // Initialize cart functionality
    initializeMobileCart();

    // Initialize checkout button
    const checkoutButton = document.querySelector('.btn-checkout');
    if (checkoutButton) {
        checkoutButton.addEventListener('click', openCheckoutModal);
    }

    // Initialize tab listeners
    document.querySelectorAll('[data-bs-toggle="pill"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', (e) => {
            const category = e.target.getAttribute('data-bs-target')?.replace('#', '');
            updateSubcategoryFilter(category);
            currentPage = 1;
            applyFilters();
        });
    });
});



