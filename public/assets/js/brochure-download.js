(async function() {
    // ===============================
    // Helper Functions
    // ===============================

    /**
     * Dynamically loads an external script.
     * @param {string} url - The URL of the script to load.
     * @returns {Promise} - Resolves when the script is loaded.
     */
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            // Avoid loading the same script multiple times
            if (document.querySelector(`script[src="${url}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = url;
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script ${url}`));
            document.head.appendChild(script);
        });
    }

    /**
     * Loads the required PDF libraries (jsPDF and jsPDF-AutoTable).
     * @returns {Promise} - Resolves when both libraries are loaded.
     */
    async function loadPDFLibraries() {
        try {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js');
        } catch (error) {           
            throw error;
        }
    }

    /**
     * Creates a loading indicator and appends it to the document body.
     * @returns {HTMLElement} - The loading indicator element.
     */
    function createLoadingIndicator() {
        // If the loading indicator already exists, just return it
        let loadingIndicator = document.getElementById('brochureLoadingIndicator');
        if (loadingIndicator) return loadingIndicator;

        // Create new loading indicator
        loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'brochureLoadingIndicator';
        loadingIndicator.classList.add('brochure-loading');
        loadingIndicator.style.display = 'none';

        const spinnerDiv = document.createElement('div');
        spinnerDiv.classList.add('brochure-spinner');
        
        loadingIndicator.appendChild(spinnerDiv);
        document.body.appendChild(loadingIndicator);

        // Add CSS styles only if they haven't been added yet
        if (!document.getElementById('brochureLoadingStyles')) {
            const style = document.createElement('style');
            style.id = 'brochureLoadingStyles';
            style.innerHTML = `
                .brochure-loading {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(27, 40, 56, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 2000;
                }
                
                .brochure-spinner {
                    width: 50px;
                    height: 50px;
                    border: 6px solid #0EA5E9;
                    border-top-color: transparent;
                    border-radius: 50%;
                    animation: brochureSpin 1s linear infinite;
                }
                
                @keyframes brochureSpin {
                    to {
                        transform: rotate(360deg);
                    }
                }
            `;
            document.head.appendChild(style);
        }
        return loadingIndicator;
    }

    /**
     * Toggles the visibility of the loading indicator.
     * @param {boolean} isLoading - Whether to show or hide the loading indicator.
     */
    function toggleLoading(isLoading) {
        const loadingElement = document.getElementById('brochureLoadingIndicator');
        if (!loadingElement && isLoading) {
            createLoadingIndicator();
            const newLoadingElement = document.getElementById('brochureLoadingIndicator');
            if (newLoadingElement) {
                newLoadingElement.style.display = 'flex';
            }
        } else if (loadingElement) {
            loadingElement.style.display = isLoading ? 'flex' : 'none';
            if (!isLoading) {
                setTimeout(() => {
                    if (loadingElement && loadingElement.parentNode) {
                        loadingElement.parentNode.removeChild(loadingElement);
                    }
                }, 300);
            }
        }
    }

    /**
     * Loads an image from a URL and converts it to a data URL.
     * @param {string} url - The URL of the image to load.
     * @returns {Promise<string|null>} - Resolves with the data URL or null if failed.
     */
    async function loadImage(url) {
        try {
            
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.statusText}`);
            }
            const blob = await response.blob();
            
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            
            return null;
        }
    }

    /**
     * Generates key features based on boat data.
     * @param {Object} boatData - The data of the boat.
     * @returns {Array<string>} - An array of key feature strings.
     */
    function generateKeyFeatures(boatData) {
        const features = [];

        if (boatData.detailedSpecs?.Length && boatData.detailedSpecs?.Guests) {
            features.push(`Magnificent ${boatData.detailedSpecs.Length} vessel accommodating ${boatData.detailedSpecs.Guests} guests`);
        }

        // Add features based on equipment and amenities
        const luxuryFeatures = [];
        if (boatData.amenities?.comfort?.stabilizers) luxuryFeatures.push("stabilizers");
        if (boatData.equipment?.jacuzziAndPool?.deckJacuzzi) luxuryFeatures.push("deck jacuzzi");
        if (luxuryFeatures.length > 0) {
            features.push(`Ultimate luxury with ${luxuryFeatures.join(" and ")}`);
        }

        // Add water sports features
        const waterToys = [];
        if (boatData.waterSports?.seaBobs?.hasSeaBobs) waterToys.push("SeaBobs");
        if (boatData.waterSports?.jetSkis?.waverunners) waterToys.push("Wave Runners");
        if (waterToys.length > 0) {
            features.push(`Complete water sports experience including ${waterToys.join(" and ")}`);
        }

        // Add entertainment features
        const entertainmentFeatures = [];
        if (boatData.amenities?.entertainment?.wifi) entertainmentFeatures.push("WiFi");
        if (boatData.amenities?.entertainment?.satellite) entertainmentFeatures.push("Satellite TV");
        if (entertainmentFeatures.length > 0) {
            features.push(`Full entertainment package with ${entertainmentFeatures.join(" and ")}`);
        }

        // Default features
        const defaultFeatures = [
            "Experienced crew providing exceptional service",
            "Prime locations throughout the Balearics",
            "Customized itineraries for your perfect journey",
            "Unforgettable Mediterranean experience"
        ];

        // Fill remaining slots with default features
        while (features.length < 4) {
            features.push(defaultFeatures[features.length] || "Additional feature");
        }

        return features.slice(0, 4);
    }

    /**
     * Retrieves the boat ID from the URL parameters.
     * @returns {string|null} - The boat ID or null if not found.
     */
    function getBoatId() {
        const urlParams = new URLSearchParams(window.location.search);
        const boatId = urlParams.get('id');
        return boatId;
    }

    /**
     * Checks if Firebase is properly initialized.
     * @returns {boolean} - True if Firebase is initialized, else false.
     */
    function isFirebaseInitialized() {
        return typeof firebase !== 'undefined' 
            && firebase.apps 
            && firebase.apps.length > 0;
    }

    /**
     * Waits for Firebase to be initialized, retrying up to maxAttempts.
     * @param {number} maxAttempts - Maximum number of attempts.
     * @returns {Promise} - Resolves when Firebase is initialized.
     */
    function waitForFirebase(maxAttempts = 50) {
        let attempts = 0;

        return new Promise((resolve, reject) => {
            function checkFirebase() {
                attempts++;
                if (isFirebaseInitialized()) {
                    
                    resolve();
                } else if (attempts >= maxAttempts) {
                    reject(new Error('Firebase initialization timeout'));
                } else {
                    
                    setTimeout(checkFirebase, 100);
                }
            }
            checkFirebase();
        });
    }

    /**
     * Adds a section header to the PDF.
     * @param {jsPDF} pdf - The jsPDF instance.
     * @param {string} title - The title of the section.
     * @param {Object} colors - The color scheme.
     */
    function addSectionHeader(pdf, title, colors) {
        pdf.setFillColor(...colors.primary);
        pdf.rect(0, 0, 210, 20, 'F');
        pdf.setFontSize(18)
           .setTextColor(255, 255, 255)
           .text(title, 105, 15, { align: 'center' });
    }

    // ===============================
    // Main PDF Generation Function
    // ===============================

    /**
     * Generates and downloads the brochure PDF.
     */
    async function downloadBrochure() {
        try {
            
            toggleLoading(true);

            // 1. Retrieve Boat ID
            const boatId = getBoatId();

            if (!boatId) {
                alert("Boat ID not found.");
                throw new Error("Boat ID not found.");
            }

            

            // 2. Fetch boat data from Firestore
            const boatDoc = await db.collection('boats').doc(boatId).get();
            if (!boatDoc.exists) {
                alert("Boat data not found.");
                throw new Error("Boat data not found.");
            }
            const boatData = boatDoc.data();
           

            // 3. Initialize jsPDF
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            // 4. Define Colors and Styles
            const colors = {
                primary: [26, 61, 93],    // Deep Blue
                accent: [14, 165, 233],   // Accent Blue
                text: [50, 50, 50],       // Charcoal
                white: [255, 255, 255]    // White
            };

            // ===============================
            // Main Page Layout
            // ===============================

            // Header
            pdf.setFillColor(...colors.primary);
            pdf.rect(0, 0, 210, 20, 'F'); // Header bar (210mm wide for A4)
            pdf.setFontSize(22).setTextColor(...colors.white)
               .text(boatData.name.toUpperCase(), 105, 15, { align: 'center' });

            // Main Image
            if (boatData.images?.length > 0) {
                const mainImage = await loadImage(boatData.images[0]);
                if (mainImage) {
                    pdf.addImage(mainImage, 'JPEG', 15, 25, 180, 90); // Adjust dimensions as needed
                }
            }

            // Key Details Grid
            const keySpecs = {
                "Length": boatData.detailedSpecs?.Length,
                "Guests": boatData.detailedSpecs?.Guests,
                "Cabins": boatData.detailedSpecs?.Cabins,
                "Crew": boatData.detailedSpecs?.Crew,
                "Built/Refit": boatData.detailedSpecs?.["Built/Refit"]
            };

            pdf.autoTable({
                startY: 120,
                margin: { left: 25, right: 25 },
                head: [['Specification', 'Value']],
                body: Object.entries(keySpecs).filter(([_, v]) => v),
                theme: 'plain',
                styles: {
                    fontSize: 11,          // Reduced font size
                    textColor: colors.text,
                    cellPadding: 2         // Reduced padding
                },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: '70%' }, // Percentage-based widths
                    1: { cellWidth: '30%' }
                },
                tableWidth: 'auto', // Let autoTable calculate widths
            });

            // Overview Section
            const overviewY = pdf.autoTable.previous.finalY + 10;
            pdf.setFontSize(16).setTextColor(...colors.primary)
               .text("OVERVIEW", 15, overviewY);
            pdf.setFontSize(12).setTextColor(...colors.text)
               .text(boatData.description || "No description available.", 
                     15, overviewY + 5, { maxWidth: 180 });

            // Key Features (Highlights)
            const featuresY = overviewY + 20;
            pdf.setFontSize(16).setTextColor(...colors.primary)
               .text("HIGHLIGHTS", 15, featuresY);
            
            generateKeyFeatures(boatData).forEach((feature, i) => {
                pdf.setFontSize(12)
                   .text(`✓ ${feature}`, 15, featuresY + 10 + (i * 8));
            });

            // Gallery Section
            if (boatData.images?.length > 1) {
                pdf.addPage();
                addSectionHeader(pdf, "GALLERY", colors);
                
                let yPos = 25;
                const imageWidth = 85;  // Adjusted for two images per row with spacing
                const imageHeight = 60;
                const spacing = 10;
                const imagesPerRow = 2;

                for (let i = 1; i < boatData.images.length; i++) { // Starting from index 1
                    const imgUrl = boatData.images[i];
                    const img = await loadImage(imgUrl);
                    if (img) {
                        const row = Math.floor((i - 1) / imagesPerRow);
                        const col = (i - 1) % imagesPerRow;
                        const x = 15 + col * (imageWidth + spacing);
                        let currentY = yPos + row * (imageHeight + spacing);

                        // Check if the image fits on the current page
                        if (currentY + imageHeight > 270) { // 270mm is near the bottom of A4
                            pdf.addPage();
                            addSectionHeader(pdf, "GALLERY", colors);
                            currentY = 25; // Reset y position for new page
                        }

                        pdf.addImage(img, 'JPEG', x, currentY, imageWidth, imageHeight);
                    }
                }
            }

            // Full Specifications
            pdf.addPage();
            addSectionHeader(pdf, "TECHNICAL SPECIFICATIONS", colors);
            
            const fullSpecs = Object.entries(boatData.detailedSpecs || {});
            pdf.autoTable({
                startY: 25,
                head: [['Specification', 'Details']],
                body: fullSpecs,
                theme: 'grid',
                styles: { 
                    fontSize: 11,
                    cellPadding: 2,            // Reduced padding
                    textColor: colors.text
                },
                headStyles: {
                    fillColor: colors.primary,
                    textColor: colors.white
                },
                alternateRowStyles: {
                    fillColor: [240, 240, 240]
                },
                columnStyles: {
                    0: { cellWidth: '40%' },
                    1: { cellWidth: '60%' }
                },
                tableWidth: 'auto', // Let autoTable calculate widths
            });

            // Pricing Section
            const prices = Object.entries(boatData.seasonalPrices || {});
            if (prices.length > 0) {
                pdf.addPage();
                addSectionHeader(pdf, "SEASONAL PRICING", colors);
                
                pdf.autoTable({
                    startY: 25,
                    head: [['Season', 'Price']],
                    body: prices,
                    theme: 'grid',
                    styles: {
                        fontSize: 11,          // Reduced font size
                        cellPadding: 2,        // Reduced padding
                        textColor: colors.text
                    },
                    headStyles: {
                        fillColor: colors.accent,
                        textColor: colors.white
                    },
                    columnStyles: {
                        0: { cellWidth: '60%' }, // Percentage-based widths
                        1: { cellWidth: '40%' }
                    },
                    tableWidth: 'auto', // Let autoTable calculate widths
                });
            }

            // Save PDF
            const fileName = `${boatData.name.replace(/\s+/g, '-')}-Brochure.pdf`;
            pdf.save(fileName);
            
        } catch (error) {
            
            alert("Failed to generate brochure. Please try again.");
        } finally {
            toggleLoading(false);
        }
    }

    // ===============================
    // Initialization Functions
    // ===============================

    /**
     * Attaches the downloadBrochure function to brochure download buttons.
     */
    async function initializeBrochureDownload() {
        try {
            
            await loadPDFLibraries();
            
            
            // Create loading indicator
            createLoadingIndicator();
            
            // Add click event to all brochure download buttons
            const brochureBtns = document.querySelectorAll('.download-brochure, button[onclick*="downloadBrochure"]');
            if (brochureBtns.length === 0) {
                
                return;
            }

            brochureBtns.forEach(button => {
                // Remove onclick attribute if it exists to prevent conflicts
                if (button.hasAttribute('onclick')) {
                    button.removeAttribute('onclick');
                }
                // Remove any existing event listeners and add new one
                button.removeEventListener('click', downloadBrochure);
                button.addEventListener('click', downloadBrochure);
                
            });
            
            
        } catch (error) {
            
        }
    }

    /**
     * Initializes the entire brochure download feature.
     */
    async function initialize() {
        try {
            
            await waitForFirebase();
            await initializeBrochureDownload();
            
        } catch (error) {
            
        }
    }

    // Start initialization when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();



