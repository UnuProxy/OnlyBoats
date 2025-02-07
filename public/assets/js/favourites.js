// Favorites System Implementation
document.addEventListener('DOMContentLoaded', function() {
    // Initialize favorites from localStorage
    let favorites = JSON.parse(localStorage.getItem('yachtFavorites')) || [];

    // Update heart icons for all favorite buttons on page load
    function updateHeartIcons() {
        document.querySelectorAll('.favorite-btn').forEach(btn => {
            const yachtId = btn.closest('.yacht-card').dataset.boatId;
            if (favorites.includes(yachtId)) {
                btn.querySelector('i').classList.remove('far');
                btn.querySelector('i').classList.add('fas');
                btn.classList.add('active');
            } else {
                btn.querySelector('i').classList.remove('fas');
                btn.querySelector('i').classList.add('far');
                btn.classList.remove('active');
            }
        });
    }

    // Add click event listeners to all favorite buttons
    function initializeFavoriteButtons() {
        document.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                const yachtCard = this.closest('.yacht-card');
                const yachtId = yachtCard.dataset.boatId;
                const icon = this.querySelector('i');
                
                // Toggle favorite status
                if (favorites.includes(yachtId)) {
                    favorites = favorites.filter(id => id !== yachtId);
                    icon.classList.remove('fas');
                    icon.classList.add('far');
                    this.classList.remove('active');
                    showToast('Removed from favorites');
                } else {
                    favorites.push(yachtId);
                    icon.classList.remove('far');
                    icon.classList.add('fas');
                    this.classList.add('active');
                    showToast('Added to favorites');
                }
                
                // Update localStorage
                localStorage.setItem('yachtFavorites', JSON.stringify(favorites));
                
                // Update favorites count in navbar if it exists
                updateFavoritesCount();
            });
        });
    }

    // Update the favorites count in the navbar
    function updateFavoritesCount() {
        const favCount = document.querySelector('.favorites-count');
        if (favCount) {
            favCount.textContent = favorites.length;
            favCount.style.display = favorites.length > 0 ? 'inline-block' : 'none';
        }
    }

    // Toast notification system
    function showToast(message) {
        // Remove existing toast if present
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) {
            existingToast.remove();
        }

        // Create new toast
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-heart"></i>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(toast);

        // Add visible class after a small delay (for animation)
        setTimeout(() => toast.classList.add('visible'), 10);

        // Remove toast after 3 seconds
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Initialize the system
    updateHeartIcons();
    initializeFavoriteButtons();
    updateFavoritesCount();

    // Add necessary styles
    const style = document.createElement('style');
    style.textContent = `
        .favorite-btn {
            position: absolute;
            top: 15px;
            right: 15px;
            background: rgba(255, 255, 255, 0.9);
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            cursor: pointer;
            z-index: 10;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .favorite-btn:hover {
            transform: scale(1.1);
            background: white;
        }

        .favorite-btn.active {
            background: #ff4757;
        }

        .favorite-btn.active i {
            color: white;
        }

        .favorite-btn i {
            color: #ff4757;
            font-size: 1.2rem;
            transition: all 0.3s ease;
        }

        .favorites-count {
            position: absolute;
            top: -8px;
            right: -8px;
            background: #ff4757;
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        }

        .toast-notification {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 30px;
            z-index: 1000;
            opacity: 0;
            transition: all 0.3s ease;
        }

        .toast-notification.visible {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }

        .toast-content {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .toast-content i {
            color: #ff4757;
        }
    `;
    document.head.appendChild(style);
});