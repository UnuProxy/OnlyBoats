// customyacht.js
$(document).ready(function() {
    "use strict";

    // Hide loader immediately if no Firebase
    if (typeof firebase === 'undefined') {
        document.getElementById('loadingOverlay').style.display = 'none';
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
});