// ===== PIPELINE & STATS PAGE SCRIPTS =====

// Burger menu toggle
function toggleBurgerMenu() {
    const sidebar = document.getElementById("burger-sidebar");
    const overlay = document.getElementById("burger-overlay");
    if (!sidebar || !overlay) return;
    const isOpen = sidebar.classList.contains("active");
    if (isOpen) {
        closeBurgerMenu();
    } else {
        sidebar.classList.add("active");
        overlay.classList.add("active");
    }
}

function closeBurgerMenu() {
    const sidebar = document.getElementById("burger-sidebar");
    const overlay = document.getElementById("burger-overlay");
    if (sidebar) sidebar.classList.remove("active");
    if (overlay) overlay.classList.remove("active");
}

// Generate floating particles
(function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        const size = Math.random() * 4 + 2;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.animationDuration = (Math.random() * 20 + 15) + 's';
        particle.style.animationDelay = (Math.random() * 20) + 's';
        particle.style.opacity = Math.random() * 0.3 + 0.1;
        container.appendChild(particle);
    }
})();

// ===== DATA FETCHING & STATS UPDATE =====
// STORAGE_KEY_* constants are declared in nav.js (loaded before this file)

function getCurrentUserId() {
    return localStorage.getItem(STORAGE_KEY_USER_ID);
}

function getCurrentUserEmail() {
    return localStorage.getItem(STORAGE_KEY_EMAIL);
}

async function fetchIncidents() {
    const userId = getCurrentUserId();
    if (!userId) {
        // No user logged in — show zeros
        updateAllStats({ incidents: [] });
        return;
    }
    try {
        const res = await fetch(`/api/incidents?user_id=${userId}`);
        const data = await res.json();
        if (data.code && data.code !== 200) {
            console.warn("Backend error:", data.msg);
            updateAllStats({ incidents: [] });
            return;
        }
        updateAllStats(data);
    } catch (err) {
        console.warn("Failed to fetch incidents (backend may be offline):", err.message);
        // Show zeros if backend is unreachable
        updateAllStats({ incidents: [] });
    }
}

function updateAllStats(data) {
    const incidents = data.incidents || [];
    const tier1 = incidents.filter(i => i.tier === 1).length;
    const tier2 = incidents.filter(i => i.tier === 2).length;
    const tier3 = incidents.filter(i => i.tier === 3).length;
    const total = incidents.length;
    const maxCount = Math.max(tier1, tier2, tier3, total, 1);

    // Update stat cards
    const elCritical = document.getElementById('stat-critical');
    const elMedium = document.getElementById('stat-medium');
    const elLow = document.getElementById('stat-low');
    const elTotal = document.getElementById('stat-total');

    if (elCritical) elCritical.textContent = tier1;
    if (elMedium) elMedium.textContent = tier2;
    if (elLow) elLow.textContent = tier3;
    if (elTotal) elTotal.textContent = total;

    // Update progress bars
    const fillCritical = document.getElementById('stat-critical-fill');
    const fillMedium = document.getElementById('stat-medium-fill');
    const fillLow = document.getElementById('stat-low-fill');
    const fillTotal = document.getElementById('stat-total-fill');

    if (fillCritical) fillCritical.style.width = (tier1 / maxCount * 100) + '%';
    if (fillMedium) fillMedium.style.width = (tier2 / maxCount * 100) + '%';
    if (fillLow) fillLow.style.width = (tier3 / maxCount * 100) + '%';
    if (fillTotal) fillTotal.style.width = '100%';

    // Update processed count (simulated — in production this would come from the backend)
    const processedEl = document.getElementById('processed-count-display');
    if (processedEl) {
        // Animate the number
        const currentCount = parseInt(processedEl.textContent) || 0;
        const targetCount = total > 0 ? total + 42 : 47; // base + incidents
        animateNumber(processedEl, currentCount, targetCount, 600);
    }
}

function animateNumber(element, start, end, duration) {
    const startTime = performance.now();
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + (end - start) * eased);
        element.textContent = current;
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    requestAnimationFrame(update);
}

// ===== INITIALIZATION =====
function init() {
    fetchIncidents();

    // Refresh stats every 15 seconds
    setInterval(fetchIncidents, 15000);

    // Listen for real-time incident updates via Socket.IO if connected
    try {
        const socket = io();
        const userId = getCurrentUserId();
        socket.on('connect', () => {
            console.log('📊 Pipeline page: Socket connected');
            if (userId) {
                socket.emit('bind_user', userId);
            }
        });
        socket.on('new_incident', (payload) => {
            const msgUserId = payload.client_user_id;
            if (msgUserId && userId && msgUserId !== userId) return;
            console.log('📩 Pipeline: New incident received, refreshing stats...');
            fetchIncidents();
        });
        socket.on('incident_updated', () => {
            fetchIncidents();
        });
    } catch (e) {
        console.log('Socket.IO not available, using polling only');
    }
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
