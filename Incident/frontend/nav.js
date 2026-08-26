// ===== InciCare — Left Sidebar Navigation (shared) =====

const STORAGE_KEY_USER_ID = 'comhub_user_id';
const STORAGE_KEY_EMAIL   = 'comhub_email';
const STORAGE_KEY_APP_PWD = 'comhub_app_pwd';

// ===== INACTIVITY AUTO-LOGOUT (shared across all pages) =====
const DEFAULT_INACTIVITY_MS = 1_800_000; // 30 minutes fallback
let inactivityTimer = null;
let heartbeatInterval = null;

function getInactivityTimeout() {
    try {
        const s = JSON.parse(localStorage.getItem('comhub_settings') || '{}');
        const val = parseInt(s.inactivity);
        if (val === 0) return 0;     // 0 = never
        if (val >= 60) return val * 1000; // stored in seconds, return ms
    } catch (e) {}
    return DEFAULT_INACTIVITY_MS;
}

function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    const timeout = getInactivityTimeout();
    if (timeout === 0) return; // "Never" — don't set a timer
    inactivityTimer = setTimeout(() => {
        console.log('⏰ Inactivity limit reached — auto-logging out');
        const uid = localStorage.getItem(STORAGE_KEY_USER_ID);
        if (uid) {
            fetch('/api/mail/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: uid })
            }).catch(() => {});
        }
        // Clear local state
        localStorage.removeItem(STORAGE_KEY_USER_ID);
        localStorage.removeItem(STORAGE_KEY_EMAIL);
        localStorage.removeItem(STORAGE_KEY_APP_PWD);
        stopInactivityTracking();
        // Show login modal
        const loginModal = document.getElementById('login-modal');
        if (loginModal) {
            document.getElementById('mail-email').value = '';
            document.getElementById('mail-apppwd').value = '';
            loginModal.classList.add('active');
        }
        // Rebuild sidebar
        if (typeof initNav === 'function') initNav('overview');
        // Show toast
        const container = document.getElementById('toast-container');
        if (container) {
            const toast = document.createElement('div');
            toast.className = 'toast tier2';
            toast.style.borderColor = '#fbbf24';
            toast.innerHTML = '<div class="toast-title">⏰ Auto-Logged Out</div><div class="toast-desc">You were signed out after ' + (timeout / 60000) + ' minutes of inactivity to protect your account.</div>';
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 6000);
        }
        console.log('👋 Auto-logged out due to inactivity');
    }, timeout);
}

function startInactivityTracking() {
    // Guard against double-initialization
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    // Listen for user activity on the whole page
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'wheel'];
    events.forEach(evt => {
        document.addEventListener(evt, resetInactivityTimer, { passive: true });
    });
    resetInactivityTimer();
    // Ping backend every 30s to keep the server-side activity timestamp fresh
    heartbeatInterval = setInterval(() => {
        const uid = localStorage.getItem(STORAGE_KEY_USER_ID);
        if (uid) {
            fetch('/api/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: uid })
            }).catch(() => {});
        }
    }, 30_000);
    const timeout = getInactivityTimeout();
    if (timeout === 0) {
        console.log('⏱️ Inactivity tracking: NEVER (disabled by user)');
    } else {
        console.log('⏱️ Inactivity tracking started — auto-logout after', timeout / 1000, 's');
    }
}

function stopInactivityTracking() {
    if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
}

// ===== NAV ITEM DEFINITIONS =====
const NAV_ITEMS = [
    { id: 'overview',   icon: 'layout-dashboard', label: 'Overview',       href: '/' },
    { id: 'activity',   icon: 'activity',         label: 'Activity Logs',  href: '/activity.html' },
    { id: 'dispatch',   icon: 'users',            label: 'Staff Dispatch', href: '/dispatch.html' },
    { id: 'completed',  icon: 'check-circle',     label: 'Completed',      href: '/completed.html' },
    { id: 'factory',    icon: 'factory',          label: 'Factory',        href: '/factory.html' },
    { id: 'map',        icon: 'map-pin',          label: 'Map View',       href: '/map.html' },
    { id: 'reports',    icon: 'bar-chart-3',      label: 'Reports',        href: '/reports.html' },
    { id: 'settings',   icon: 'settings',         label: 'Settings',       href: '/settings.html' },
];

// ===== BUILD SIDEBAR HTML =====
function buildNavSidebar(activeId) {
    const userId  = localStorage.getItem(STORAGE_KEY_USER_ID);
    const email   = localStorage.getItem(STORAGE_KEY_EMAIL);
    const initial = email ? email.charAt(0).toUpperCase() : '?';
    const displayEmail = email || 'Not signed in';
    const displayName  = email ? email.split('@')[0] : 'Guest';

    const itemsHtml = NAV_ITEMS.map(item => `
        <a class="nav-item${item.id === activeId ? ' active' : ''}"
           href="${item.href}"
           id="nav-${item.id}"
           title="${item.label}">
            <i data-lucide="${item.icon}" class="nav-item-icon lucide"></i>
            <span class="nav-item-label">${item.label}</span>
        </a>
    `).join('');

    const userSection = userId ? `
        <button class="nav-user-btn" onclick="toggleNavUserDropdown()" id="nav-user-btn" title="${displayEmail}">
            <div class="nav-user-info" style="flex:1;">
                <div class="nav-user-name" id="nav-user-name">${displayName}</div>
                <div class="nav-user-email" id="nav-user-email">${displayEmail}</div>
            </div>
        </button>
        <div class="nav-user-dropdown" id="nav-user-dropdown">
            <button class="nav-dropdown-item danger" onclick="navLogout()">
                <i data-lucide="log-out" class="lucide lucide-sm"></i> Sign Out
            </button>
        </div>
    ` : `
        <button class="nav-user-login-btn" onclick="navOpenLogin()">
            <i data-lucide="log-in" class="lucide lucide-sm"></i>
            <span>Sign In</span>
        </button>
    `;

    return `
    <nav class="left-nav" id="left-nav">
        <!-- Brand -->
        <div class="nav-brand">
            <div class="nav-brand-inner">
                <div class="nav-brand-icon"><i data-lucide="shield" class="lucide lucide-xl"></i></div>
                <div class="nav-brand-text">
                    <h2>InciCare</h2>
                    <span>Incident Management</span>
                </div>
            </div>
        </div>

        <!-- Navigation items -->
        <div class="nav-items">
            <div class="nav-section-label">Navigation</div>
            ${itemsHtml}
            <div class="nav-divider"></div>
            <!-- Live status chip -->
            <div class="nav-status-chip">
                <div class="nav-status-dot"></div>
                <span>System Online</span>
            </div>
        </div>

        <!-- User profile -->
        <div class="nav-user">
            ${userSection}
        </div>

    </nav>`;
}

// ===== INJECT SIDEBAR into the page =====
function initNav(activeId) {
    // Remove old sidebar / burger / overlay if present
    const oldNav = document.querySelector('.left-nav');
    if (oldNav) oldNav.remove();
    const oldBurger = document.querySelector('.burger-sidebar');
    if (oldBurger) oldBurger.remove();
    const oldOverlay = document.querySelector('.burger-overlay');
    if (oldOverlay) oldOverlay.remove();

    // Inject left nav before any other body content
    const html = buildNavSidebar(activeId);
    document.body.insertAdjacentHTML('afterbegin', html);

    // Render Lucide icons in the sidebar
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Start inactivity tracking if user is logged in
    const userId = localStorage.getItem(STORAGE_KEY_USER_ID);
    if (userId) {
        startInactivityTracking();
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('nav-user-dropdown');
        const btn = document.getElementById('nav-user-btn');
        if (dropdown && btn && !btn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('open');
        }
    });
}

// ===== TOGGLE USER DROPDOWN =====
function toggleNavUserDropdown() {
    const dropdown = document.getElementById('nav-user-dropdown');
    if (dropdown) dropdown.classList.toggle('open');
}

// ===== UPDATE USER INFO (call after login) =====
// Reads the signed-in email straight from localStorage and refreshes every
// place the username/email is shown: the sidebar profile AND the Settings
// "Account" card (when present). Keeps the displayed username in sync with
// the email whenever the account changes — including from another tab.
function refreshUserIdentity() {
    const email   = localStorage.getItem(STORAGE_KEY_EMAIL);
    const name    = email ? email.split('@')[0] : 'Guest';
    const initial = email ? email.charAt(0).toUpperCase() : '?';

    // Sidebar profile
    const nameEl  = document.getElementById('nav-user-name');
    const emailEl = document.getElementById('nav-user-email');
    if (nameEl)  nameEl.textContent  = name;
    if (emailEl) emailEl.textContent = email || '';

    // Settings "Account" card (only exists on settings.html)
    const accNameEl   = document.getElementById('acc-name');
    const accEmailEl  = document.getElementById('acc-email');
    const accAvatarEl = document.getElementById('acc-avatar');
    if (accNameEl)   accNameEl.textContent   = email ? name : 'Not signed in';
    if (accEmailEl)  accEmailEl.textContent  = email || 'Sign in from the Overview to use InciCare';
    if (accAvatarEl) accAvatarEl.textContent = email ? initial : '?';
}

function updateNavUser(email) {
    refreshUserIdentity();
}

// Keep every open page in sync when the account changes in another tab.
window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY_EMAIL || e.key === STORAGE_KEY_USER_ID) {
        refreshUserIdentity();
    }
});

// Refresh when a page is restored from the back/forward cache (bfcache),
// which can otherwise show a stale username after a re-login elsewhere.
window.addEventListener('pageshow', (e) => {
    if (e.persisted) refreshUserIdentity();
});

// ===== OPEN LOGIN MODAL =====
function navOpenLogin() {
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.classList.add('active');
    } else {
        window.location.href = '/?showLogin=true';
    }
}

// ===== LOGOUT =====
async function navLogout() {
    const userId = localStorage.getItem(STORAGE_KEY_USER_ID);
    if (userId) {
        try {
            await fetch('/api/mail/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
        } catch (e) { /* backend may be offline */ }
    }
    localStorage.removeItem(STORAGE_KEY_USER_ID);
    localStorage.removeItem(STORAGE_KEY_EMAIL);
    localStorage.removeItem(STORAGE_KEY_APP_PWD);
    window.location.href = '/';
}

// ===== UPDATE BADGE on nav item (e.g. critical count) =====
function updateNavBadge(itemId, count, severity = 'critical') {
    const el = document.getElementById(`nav-${itemId}-badge`);
    if (!el) return;
    if (count > 0) {
        el.textContent = count;
        el.style.display = 'inline-block';
    } else {
        el.style.display = 'none';
    }
}
