// ===== InciCare Incident Map — map.js =====

// STORAGE_KEY_* constants are declared in nav.js (loaded before this file)

let map = null;
let clusterGroup = null;     // Leaflet.markercluster group
let heatLayer = null;        // Leaflet.heat layer
let heatmapActive = false;
let mapPoints = [];          // all fetched location points
let markers = {};            // incidentId+locationName -> Leaflet marker
let activeCardId = null;     // currently highlighted sidebar card
let socket = null;
let currentUserId  = null;
let currentUserEmail = null;
let searchQuery = '';
let activeTierFilter = 'all';
let activeTimeFilter = 'all';

// ===== TIER COLOURS =====
const TIER_COLOR = { 1: '#ef4444', 2: '#eab308', 3: '#22c55e' };
const TIER_EMOJI = { 1: '🔴', 2: '🟡', 3: '🟢' };

// ===== INIT MAP =====
function initMap() {
    map = L.map('incident-map', {
        center: [20, 0],
        zoom: 2,
        zoomControl: true,
        attributionControl: true
    });

    // Dark tile layer — CartoDB Dark Matter
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    // Zoom control already in the top-left; leave it there
    map.zoomControl.setPosition('topleft');

    // Create marker cluster group with custom styling
    // Graceful fallback if CDN fails to load
    try {
        if (typeof L.markerClusterGroup === 'function') {
            clusterGroup = L.markerClusterGroup({
                maxClusterRadius: 50,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false,
                zoomToBoundsOnClick: true,
                iconCreateFunction: createClusterIcon
            });
            map.addLayer(clusterGroup);
            console.log('🗺️ MarkerClusterGroup initialized');
        } else {
            console.warn('⚠️ L.markerClusterGroup not available — markers will display without clustering');
        }
    } catch (e) {
        console.warn('⚠️ MarkerClusterGroup init failed, falling back to direct markers:', e.message);
        clusterGroup = null;
    }
}

// ===== CREATE CUSTOM CLUSTER ICON =====
function createClusterIcon(cluster) {
    const childMarkers = cluster.getAllChildMarkers();
    const count = childMarkers.length;

    // Determine dominant tier for cluster coloring
    let hasT1 = false, hasT2 = false;
    childMarkers.forEach(m => {
        const tier = m.options.tier || 3;
        if (tier === 1) hasT1 = true;
        if (tier === 2) hasT2 = true;
    });

    let colorClass = 'cluster-t3';
    if (hasT1) colorClass = 'cluster-t1';
    else if (hasT2) colorClass = 'cluster-t2';

    // Size based on count
    let size = 40;
    if (count >= 100) size = 60;
    else if (count >= 20) size = 52;
    else if (count >= 5) size = 46;

    return L.divIcon({
        html: `<div class="custom-cluster-icon ${colorClass}" style="width:${size}px;height:${size}px;"><span>${count < 100 ? count : '99+'}</span></div>`,
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
}

// ===== CREATE CUSTOM LEAFLET ICON =====
function createMarkerIcon(tier, isNew = false) {
    const size = tier === 1 ? 36 : tier === 2 ? 32 : 28;
    const emoji = TIER_EMOJI[tier];
    return L.divIcon({
        className: '',
        html: `<div class="custom-map-marker t${tier}${isNew ? ' new-marker' : ''}"
                    style="width:${size}px;height:${size}px;">${emoji}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -(size / 2 + 4)],
        tier: tier  // stored for cluster icon coloring
    });
}

// ===== POPUP HTML =====
function buildPopupHtml(point) {
    const ackBadge = point.acknowledged
        ? '<span style="color:#22c55e;font-weight:600;">✓ Acknowledged</span>'
        : '<span style="color:#f87171;font-weight:600;">⚠ Pending</span>';

    // SLA countdown
    let slaHtml = '';
    if (point.sla_deadline_ts) {
        const now = Math.floor(Date.now() / 1000);
        const remaining = point.sla_deadline_ts - now;
        if (remaining > 0) {
            const hours = Math.floor(remaining / 3600);
            const mins = Math.floor((remaining % 3600) / 60);
            let slaColor = '#22c55e';  // green
            if (remaining < 900) slaColor = '#ef4444';       // < 15 min = red
            else if (remaining < 3600) slaColor = '#eab308'; // < 1 hour = amber
            slaHtml = `<span style="color:${slaColor};font-weight:600;">⏱ SLA: ${hours}h ${mins}m remaining</span>`;
        } else {
            slaHtml = '<span style="color:#ef4444;font-weight:600;">🚨 SLA EXPIRED</span>';
        }
    }

    return `
    <div class="map-popup">
        <div class="map-popup-header">
            <div class="map-popup-tier-dot t${point.tier}"></div>
            <span class="map-popup-id t${point.tier}">${point.incident_id}</span>
            <span class="map-popup-tier-label">${point.tier_label}</span>
        </div>
        <div class="map-popup-location">📍 ${point.location_name}</div>
        <div class="map-popup-title">${point.incident_title}</div>
        <div class="map-popup-meta">
            <span>🕐 ${point.created_at}</span>
            <span>📊 ${ackBadge}</span>
            ${slaHtml ? '<span>' + slaHtml + '</span>' : ''}
            ${point.classification_reason ? `<span style="color:#8b949e;font-style:italic;margin-top:4px;">"${point.classification_reason}"</span>` : ''}
        </div>
        <div class="map-popup-action">
            <button class="map-popup-btn" onclick="window.location.href='/?highlight=${point.incident_id}'">
                View in Dashboard →
            </button>
            <button class="map-popup-btn dispatch-btn" style="margin-top:6px;background:linear-gradient(135deg, #6366f1, #4f46e5);"
                    onclick="window.location.href='/dispatch.html?incident=${point.incident_id}'">
                🚀 Dispatch
            </button>
        </div>
    </div>`;
}

// ===== ADD / UPDATE A MARKER =====
function addMarker(point, isNew = false) {
    const key = `${point.incident_id}__${point.location_name}`;
    if (markers[key]) return; // already in cluster group

    const icon = createMarkerIcon(point.tier, isNew);
    const marker = L.marker([point.lat, point.lon], { icon, tier: point.tier })
        .bindPopup(buildPopupHtml(point), {
            maxWidth: 300,
            className: 'custom-leaflet-popup'
        })
        .bindTooltip(point.location_name, {
            direction: 'top',
            offset: [0, -10],
            className: 'map-marker-tooltip'
        });

    marker.on('click', () => highlightCard(key));
    markers[key] = marker;
    if (clusterGroup) {
        clusterGroup.addLayer(marker);
    } else {
        marker.addTo(map);
    }
    return marker;
}

// ===== CLEAR ALL MARKERS =====
function clearAllMarkers() {
    if (clusterGroup) {
        clusterGroup.clearLayers();
    } else {
        Object.values(markers).forEach(m => map.removeLayer(m));
    }
    markers = {};
}

// ===== PLACE ALL MATCHING MARKERS (respects filters) =====
function renderFilteredMarkers(points) {
    clearAllMarkers();
    const filtered = applyPointFilters(points);
    filtered.forEach(p => addMarker(p, false));
    return filtered;
}

// ===== APPLY TIER + TIME FILTERS =====
function applyPointFilters(points) {
    const now = Date.now();
    const ms24h = 24 * 60 * 60 * 1000;
    const ms7d = 7 * 24 * 60 * 60 * 1000;

    return points.filter(p => {
        // Tier filter
        if (activeTierFilter !== 'all' && p.tier !== parseInt(activeTierFilter)) {
            return false;
        }
        // Time filter
        if (activeTimeFilter !== 'all') {
            const created = new Date(p.created_at).getTime();
            if (isNaN(created)) return true; // can't parse date, show it
            if (activeTimeFilter === '24h' && (now - created) > ms24h) return false;
            if (activeTimeFilter === '7d' && (now - created) > ms7d) return false;
        }
        // Search query
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!p.location_name.toLowerCase().includes(q) &&
                !p.incident_title.toLowerCase().includes(q) &&
                !p.incident_id.toLowerCase().includes(q)) {
                return false;
            }
        }
        return true;
    });
}

// ===== APPLY FILTERS (called when any filter changes) =====
function applyFilters() {
    const visiblePoints = renderFilteredMarkers(mapPoints);
    renderSidebar(visiblePoints);
    updateStats(visiblePoints);

    // Update heatmap if active
    if (heatmapActive && visiblePoints.length > 0) {
        updateHeatLayer(visiblePoints);
    }
}

// ===== SIDEBAR CARD HTML =====
function buildCardHtml(point, key) {
    return `
    <div class="map-loc-card" id="card-${CSS.escape(key)}"
         data-key="${key}"
         onclick="flyToPoint('${CSS.escape(key)}')">
        <div class="map-loc-card-header">
            <div class="map-loc-dot t${point.tier}"></div>
            <span class="map-loc-name">${point.location_name}</span>
            <span class="map-loc-incident-id t${point.tier}">${point.incident_id}</span>
        </div>
        <div class="map-loc-title">${point.incident_title}</div>
        <div class="map-loc-meta">🕐 ${point.created_at} · ${point.tier_label}</div>
    </div>`;
}

// ===== RENDER SIDEBAR LIST =====
function renderSidebar(points) {
    const list = document.getElementById('map-loc-list');

    if (points.length === 0) {
        const hasAnyFilters = activeTierFilter !== 'all' || activeTimeFilter !== 'all' || searchQuery;
        list.innerHTML = `<div class="map-sidebar-empty">
            <div class="empty-icon">🗺️</div>
            <div>${hasAnyFilters ? 'No locations match your current filters.' : 'No location data yet.<br>Locations are extracted automatically from incoming emails.'}</div>
        </div>`;
        return;
    }

    list.innerHTML = points.map(p => {
        const key = `${p.incident_id}__${p.location_name}`;
        return buildCardHtml(p, key);
    }).join('');

    // Restore active highlight
    if (activeCardId) {
        try {
            const el = document.getElementById(`card-${CSS.escape(activeCardId)}`);
            if (el) el.classList.add('active');
        } catch (e) {
            activeCardId = null;
        }
    }
}

// ===== UPDATE STAT CHIPS =====
function updateStats(points) {
    const t1 = points.filter(p => p.tier === 1).length;
    const t2 = points.filter(p => p.tier === 2).length;
    const t3 = points.filter(p => p.tier === 3).length;

    document.getElementById('map-count-t1').textContent    = `🔴 ${t1}`;
    document.getElementById('map-count-t2').textContent    = `🟡 ${t2}`;
    document.getElementById('map-count-t3').textContent    = `🟢 ${t3}`;
    document.getElementById('map-count-total').textContent = `📍 ${points.length} points`;

    // Status bar counter
    const el = document.getElementById('map-point-count');
    if (el) el.textContent = points.length;
}

// ===== FLY TO + OPEN POPUP =====
function flyToPoint(key) {
    const marker = markers[key];
    if (!marker) return;

    // Update sidebar highlight
    document.querySelectorAll('.map-loc-card').forEach(c => c.classList.remove('active'));
    try {
        const card = document.getElementById(`card-${CSS.escape(key)}`);
        if (card) { card.classList.add('active'); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    } catch (e) {}
    activeCardId = key;

    const latlng = marker.getLatLng();
    map.flyTo(latlng, Math.max(map.getZoom(), 6), { duration: 0.8 });
    setTimeout(() => marker.openPopup(), 900);
}

function highlightCard(key) {
    activeCardId = key;
    document.querySelectorAll('.map-loc-card').forEach(c => c.classList.remove('active'));
    try {
        const card = document.getElementById(`card-${CSS.escape(key)}`);
        if (card) { card.classList.add('active'); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    } catch (e) {}
}

// ===== LOAD LOCATION DATA =====
async function loadMapData() {
    if (!currentUserId) return;

    const loadingEl = document.getElementById('map-loading');
    const emptyEl   = document.getElementById('map-empty');
    if (loadingEl) loadingEl.style.display = 'flex';
    if (emptyEl)   emptyEl.style.display = 'none';

    try {
        const res  = await fetch(`/api/locations?user_id=${currentUserId}`);
        const data = await res.json();

        if (loadingEl) loadingEl.style.display = 'none';

        if (!data.points || data.points.length === 0) {
            if (emptyEl) emptyEl.style.display = 'block';
            renderSidebar([]);
            updateStats([]);
            return;
        }

        mapPoints = data.points;
        const visiblePoints = renderFilteredMarkers(mapPoints);
        renderSidebar(visiblePoints);
        updateStats(visiblePoints);

        // Auto-fit map to all markers
        if (Object.keys(markers).length > 0) {
            const group = L.featureGroup(Object.values(markers));
            map.fitBounds(group.getBounds().pad(0.2));
        }

    } catch (err) {
        if (loadingEl) loadingEl.style.display = 'none';
        console.error('Failed to load location data:', err);
    }
}

// ===== REAL-TIME: new_incident socket event =====
function handleNewIncident(payload) {
    const inc = payload.incident || payload;
    const msgUserId = payload.client_user_id;
    if (msgUserId && currentUserId && msgUserId !== currentUserId) return;

    const locs = inc.locations || [];
    if (locs.length === 0) return;

    locs.forEach(loc => {
        const point = {
            incident_id: inc.id,
            incident_title: inc.title,
            tier: inc.tier,
            tier_label: inc.tier_label,
            status: inc.status,
            acknowledged: inc.acknowledged,
            created_at: inc.created_at,
            sla_deadline_ts: inc.sla_deadline_ts || null,
            classification_reason: inc.classification_reason || '',
            location_name: loc.name,
            lat: loc.lat,
            lon: loc.lon,
            display_name: loc.display_name || loc.name
        };
        mapPoints.unshift(point);
        // Only add if it matches current filters
        if (applyPointFilters([point]).length > 0) {
            addMarker(point, true); // isNew = true → animation
        }
    });

    // Re-render with current filters
    const visiblePoints = applyPointFilters(mapPoints);
    renderSidebar(visiblePoints);
    updateStats(visiblePoints);

    // Update heatmap if active
    if (heatmapActive) {
        updateHeatLayer(visiblePoints);
    }

    // Auto-pan to the first new location
    if (locs.length > 0) {
        const firstKey = `${inc.id}__${locs[0].name}`;
        if (markers[firstKey]) {
            setTimeout(() => flyToPoint(firstKey), 400);
        }
    }
}

// ===== SEARCH HANDLER (now syncs map + sidebar) =====
function handleMapSearch(val) {
    searchQuery = val;
    applyFilters();
}

// ===== FILTER BUTTON HANDLERS =====
document.addEventListener('click', function(e) {
    // Tier filter buttons
    if (e.target.classList.contains('map-filter-btn') && e.target.dataset.tier) {
        document.querySelectorAll('.map-filter-btn[data-tier]').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeTierFilter = e.target.dataset.tier;
        applyFilters();
    }
    // Time filter buttons
    if (e.target.classList.contains('map-filter-btn') && e.target.dataset.time) {
        document.querySelectorAll('.map-filter-btn[data-time]').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeTimeFilter = e.target.dataset.time;
        applyFilters();
    }
});

// ===== HEATMAP TOGGLE =====
function toggleHeatmap() {
    heatmapActive = !heatmapActive;
    const btn = document.getElementById('heatmap-toggle-btn');

    if (heatmapActive) {
        // Show heatmap, hide markers
        if (clusterGroup) {
            clusterGroup.remove();
        } else {
            Object.values(markers).forEach(m => map.removeLayer(m));
        }
        const visiblePoints = applyPointFilters(mapPoints);
        updateHeatLayer(visiblePoints);
        if (btn) { btn.classList.add('active'); btn.textContent = '🌡️ Heatmap ON'; }
    } else {
        // Hide heatmap, show markers
        if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
        if (clusterGroup) {
            map.addLayer(clusterGroup);
        } else {
            Object.values(markers).forEach(m => map.addLayer(m));
        }
        if (btn) { btn.classList.remove('active'); btn.textContent = '🌡️ Heatmap'; }
    }
}

function updateHeatLayer(points) {
    if (heatLayer) { map.removeLayer(heatLayer); }

    if (points.length === 0) return;

    const heatData = points.map(p => {
        // Weight by tier: T1=3, T2=2, T3=1
        const intensity = p.tier === 1 ? 3 : p.tier === 2 ? 2 : 1;
        return [p.lat, p.lon, intensity];
    });

    heatLayer = L.heatLayer(heatData, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        max: 5,
        gradient: {
            0.0: '#22c55e',   // green for low density
            0.4: '#eab308',   // yellow for medium
            0.7: '#ef4444',   // red for high
            1.0: '#7f1d1d'    // dark red for very high
        }
    }).addTo(map);
}

// ===== INIT =====
window.addEventListener('DOMContentLoaded', async () => {
    // Read session from localStorage
    currentUserId    = localStorage.getItem(STORAGE_KEY_USER_ID);
    currentUserEmail = localStorage.getItem(STORAGE_KEY_EMAIL);

    // Update header profile
    const profileWrapper = document.getElementById('profile-wrapper');
    const profileInitial = document.getElementById('profile-initial');
    const profileEmailDisplay = document.getElementById('profile-email-display');
    if (currentUserEmail && profileWrapper) {
        profileWrapper.style.display = 'block';
        if (profileInitial)      profileInitial.textContent = currentUserEmail.charAt(0).toUpperCase();
        if (profileEmailDisplay) profileEmailDisplay.textContent = currentUserEmail;
    }

    // Init map (creates clusterGroup)
    initMap();

    if (!currentUserId) {
        // Not logged in — show hint and redirect
        const emptyEl = document.getElementById('map-empty');
        if (emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.querySelector('p').textContent = 'Please log in from the Dashboard first, then return to this page.';
        }
        const loadingEl = document.getElementById('map-loading');
        if (loadingEl) loadingEl.style.display = 'none';
        setTimeout(() => window.location.href = '/', 2500);
        return;
    }

    // Load existing data
    await loadMapData();

    // WebSocket for real-time updates
    try {
        socket = io();
        socket.on('connect', () => {
            console.log('🗺️ Map socket connected');
            socket.emit('bind_user', currentUserId);
        });
        socket.on('new_incident', handleNewIncident);
        socket.on('connect_error', () => console.warn('Map: socket offline'));
    } catch (e) {
        console.warn('Map: Socket.IO not available');
    }
});

// Burger menu helpers
function toggleBurgerMenu() {
    const sidebar = document.getElementById('burger-sidebar');
    const overlay = document.getElementById('burger-overlay');
    if (!sidebar || !overlay) return;
    const isOpen = sidebar.classList.contains('active');
    isOpen ? closeBurgerMenu() : (sidebar.classList.add('active'), overlay.classList.add('active'));
}
function closeBurgerMenu() {
    const sidebar = document.getElementById('burger-sidebar');
    const overlay = document.getElementById('burger-overlay');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
}
function toggleProfileDropdown() {
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) dropdown.classList.toggle('active');
    closeBurgerMenu();
}
document.addEventListener('click', function(e) {
    const profile  = document.getElementById('profile-wrapper');
    const dropdown = document.getElementById('profile-dropdown');
    if (profile && dropdown && !profile.contains(e.target)) {
        dropdown.classList.remove('active');
    }
});
