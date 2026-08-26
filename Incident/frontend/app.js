// Mock incident demo data
const mockData = {
    "incidents": [
        {
            "id": "INC-001",
            "title": "Logistics Delivery System Down",
            "description": "West Singapore distribution center API timeout, 300+ orders backlogged",
            "tier": 1,
            "tier_label": "Critical",
            "source": "system_alert",
            "status": "active",
            "acknowledged": false,
            "created_at": "2026-07-15 09:23:00",
            "sla_countdown": 450
        },
        {
            "id": "INC-002",
            "title": "Payment Gateway Intermittent Errors",
            "description": "Credit card channel showing 5% failure rate, investigation required",
            "tier": 2,
            "tier_label": "Medium",
            "source": "email",
            "status": "active",
            "acknowledged": true,
            "acknowledged_by": "Ops Team - Li Ming",
            "created_at": "2026-07-15 09:45:00",
            "sla_countdown": 1800
        },
        {
            "id": "INC-003",
            "title": "Daily System Health Report",
            "description": "Overnight backup completed successfully, no anomalies detected",
            "tier": 3,
            "tier_label": "Low",
            "source": "log",
            "status": "resolved",
            "acknowledged": true,
            "created_at": "2026-07-15 03:00:00",
            "sla_countdown": 0
        },
        {
            "id": "INC-004",
            "title": "User Login Service Latency Spike",
            "description": "Average response time increased from 200ms to 800ms",
            "tier": 2,
            "tier_label": "Medium",
            "source": "webhook",
            "status": "active",
            "acknowledged": false,
            "created_at": "2026-07-15 10:02:00",
            "sla_countdown": 2400
        },
        {
            "id": "INC-005",
            "title": "Database Disk Space Warning",
            "description": "Primary database at 85% capacity, expansion recommended",
            "tier": 3,
            "tier_label": "Low",
            "source": "monitoring",
            "status": "active",
            "acknowledged": false,
            "created_at": "2026-07-15 08:15:00",
            "sla_countdown": 7200
        }
    ]
};

let currentFilter = 'all';
let searchQuery = '';
let incidents = [];
let incidentCounter = 5;
let processedCount = 47;
let currentModalId = null;
let socket = null;

// ─── Notification History ──────────────────────────────────────────
const NOTIF_KEY = 'comhub_notifications';
let notificationHistory = loadJson(NOTIF_KEY, []);
let unreadCount = notificationHistory.filter(n => !n.read).length;

function addNotification(type, title, msg) {
    const n = { type, title, msg, time: Date.now(), read: false };
    notificationHistory.unshift(n);
    if (notificationHistory.length > 50) notificationHistory.length = 50;
    unreadCount++;
    saveJson(NOTIF_KEY, notificationHistory);
    updateNotifBadge();
}

function updateNotifBadge() {
    const badge = document.getElementById('notif-badge');
    if (badge) {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
    }
}

function toggleNotifPanel() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    const show = panel.style.display === 'none';
    panel.style.display = show ? 'block' : 'none';
    if (show) {
        renderNotifPanel();
        // Mark all as read
        notificationHistory.forEach(n => n.read = true);
        unreadCount = 0;
        updateNotifBadge();
        saveJson(NOTIF_KEY, notificationHistory);
    }
}

function clearNotifications() {
    notificationHistory = [];
    unreadCount = 0;
    saveJson(NOTIF_KEY, []);
    updateNotifBadge();
    renderNotifPanel();
}

function renderNotifPanel() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (notificationHistory.length === 0) {
        list.innerHTML = '<div class="notif-item empty">No notifications yet</div>';
        return;
    }
    const icons = { ok: '✅', err: '❌', warn: '⚠️', info: 'ℹ️' };
    list.innerHTML = notificationHistory.slice(0, 20).map(n => {
        const ago = relativeTime(new Date(n.time).toISOString());
        return `<div class="notif-item">
            <div class="notif-item-icon">${icons[n.type] || 'ℹ️'}</div>
            <div class="notif-item-body">
                <div class="notif-item-title">${n.title}</div>
                ${n.msg ? '<div style="font-size:11px;color:var(--text-secondary);">'+n.msg+'</div>' : ''}
                <div class="notif-item-time">${ago}</div>
            </div>
        </div>`;
    }).join('');
}

// Close notif panel when clicking outside
document.addEventListener('click', function(e) {
    const panel = document.getElementById('notif-panel');
    const bell = document.getElementById('notif-bell');
    if (panel && bell && !panel.contains(e.target) && !bell.contains(e.target)) {
        panel.style.display = 'none';
    }
});

// Override showToast to also add to notification history
const _origShowToast = showToast;
showToast = function(type, title, msg, durationMs) {
    _origShowToast(type, title, msg, durationMs);
    addNotification(type, title, msg || '');
};

// Multi-user login global variables
let currentUserId = null;
let currentUserEmail = null;
const loginModal = document.getElementById("login-modal");
const loginTip = document.getElementById("login-tip");
// STORAGE_KEY_* constants are declared in nav.js (loaded before this file)

// --- Sound Alert System ---
let audioCtx = null;
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}
function playBeep(frequency, duration, volume = 0.3) {
    initAudio();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + duration);
}
function playAlertSound(tier) {
    if (tier === 1) {
        playBeep(880, 0.15, 0.4);
        setTimeout(() => playBeep(880, 0.15, 0.4), 200);
        setTimeout(() => playBeep(880, 0.15, 0.4), 400);
        setTimeout(() => playBeep(1100, 0.3, 0.4), 600);
    } else if (tier === 2) {
        playBeep(660, 0.25, 0.3);
    }
    // Tier 3 has no alert sound
}

// Popup toast notification
function showToast(incident) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast tier${incident.tier}`;
    toast.innerHTML = `
        <div class="toast-title">📬 New Alert Received: ${incident.id}</div>
        <div class="toast-desc">${incident.title}</div>
        <span class="toast-tier tier${incident.tier}">${incident.tier_label}</span>
    `;
    container.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Desktop notification popup (browser Notification API)
let notificationPermission = 'default';
function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(perm => {
        notificationPermission = perm;
        console.log('🔔 Notification permission:', perm);
    });
}
function showDesktopNotification(incident) {
    if (!('Notification' in window) || notificationPermission !== 'granted') return;
    const emoji = incident.tier === 1 ? '🔴' : incident.tier === 2 ? '🟡' : '🟢';
    const n = new Notification(`${emoji} ${incident.id}: ${incident.tier_label}`, {
        body: incident.title,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">🚨</text></svg>',
        tag: incident.id,
        requireInteraction: incident.tier === 1,  // Critical alerts stay until dismissed
    });
    if (incident.tier !== 1) {
        setTimeout(() => n.close(), 8000);
    }
    n.onclick = () => {
        window.focus();
        n.close();
    };
}

// Flash the browser tab title to catch attention
let titleFlashInterval = null;
let originalTitle = document.title;
function flashTitle(incident) {
    if (titleFlashInterval) clearInterval(titleFlashInterval);
    const alertTitle = `⚠ ${incident.id}: ${incident.title}`;
    let flash = true;
    titleFlashInterval = setInterval(() => {
        document.title = flash ? alertTitle : originalTitle;
        flash = !flash;
    }, 800);
    // Stop flashing after 8 seconds, or when user interacts
    setTimeout(() => stopTitleFlash(), 8000);
    document.addEventListener('click', stopTitleFlash, { once: true });
    document.addEventListener('keydown', stopTitleFlash, { once: true });
}
function stopTitleFlash() {
    if (titleFlashInterval) {
        clearInterval(titleFlashInterval);
        titleFlashInterval = null;
        document.title = originalTitle;
    }
}

// Unified notification: toast + sound + desktop + title flash
function notifyNewIncident(incident) {
    showToast(incident);
    playAlertSound(incident.tier);
    showDesktopNotification(incident);
    flashTitle(incident);
}

// ===================== Mail Login Functions (All English) =====================
function togglePassword() {
    const input = document.getElementById('mail-apppwd');
    const btn = document.getElementById('pwd-toggle');
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
        btn.title = 'Hide password';
    } else {
        input.type = 'password';
        btn.textContent = '👁️';
        btn.title = 'Show password';
    }
}

async function submitMailLogin() {
    const emailInput = document.getElementById("mail-email").value.trim();
    const appPwdInput = document.getElementById("mail-apppwd").value.trim();
    const submitBtn = document.getElementById("login-submit-btn");
    const modalEl = document.getElementById("login-modal");
    const tipEl = document.getElementById("login-tip");

    if (tipEl) {
        tipEl.style.color = "#f87171";
        tipEl.textContent = "";
    }

    if (!emailInput || !appPwdInput) {
        if (tipEl) tipEl.textContent = "Please fill in both email and app specific password";
        return;
    }

    // Set UI loading state
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = "⏳ Connecting to Gmail IMAP...";
        submitBtn.style.opacity = "0.7";
    }
    if (tipEl) {
        tipEl.style.color = "#34d399";
        tipEl.textContent = "Authenticating with Gmail IMAP server...";
    }

    try {
        const response = await fetch("/api/mail/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: emailInput, app_pwd: appPwdInput })
        });
        const data = await response.json();

        if (data.code !== 200) {
            if (tipEl) {
                tipEl.style.color = "#f87171";
                tipEl.textContent = data.msg || "Authentication failed";
            }
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = "🚀 Start Monitoring";
                submitBtn.style.opacity = "1";
            }
            return;
        }

        // Login success
        currentUserId = data.user_id;
        currentUserEmail = emailInput;

        // Persist to localStorage
        localStorage.setItem(STORAGE_KEY_USER_ID, currentUserId);
        localStorage.setItem(STORAGE_KEY_EMAIL, currentUserEmail);
        localStorage.setItem(STORAGE_KEY_APP_PWD, appPwdInput);
        // Store server start time for restart detection
        fetch("/api/ping").then(r => r.json()).then(d => {
            localStorage.setItem(STORAGE_KEY_SERVER_START, d.server_start_time);
        }).catch(() => {});

        // Rebuild sidebar — switches from "Sign In" to user profile with email
        if (typeof initNav === 'function') {
            initNav('overview');
        }

        // Hide modal
        if (modalEl) {
            modalEl.classList.remove("active");
        } else if (loginModal) {
            loginModal.classList.remove("active");
        }

        // Prime audio & request notification permission
        initAudio();
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        requestNotificationPermission();

        if (socket && socket.connected) {
            socket.emit("bind_user", currentUserId);
        }

        // Load incidents
        await loadUserIncidents();

        // Start inactivity tracking (auto-logout after 60s)
        startInactivityTracking();

        // Restore button state
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = "🚀 Start Monitoring";
            submitBtn.style.opacity = "1";
        }
    } catch (error) {
        if (tipEl) {
            tipEl.style.color = "#f87171";
            tipEl.textContent = "Failed to connect to backend server. Ensure backend/app.py is running.";
        }
        console.error("Login fetch error:", error);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = "🚀 Start Monitoring";
            submitBtn.style.opacity = "1";
        }
    }
}

// updateHeaderUser removed — user info now lives in the left sidebar (nav.js)

// Log out current user
async function logoutUser() {
    stopInactivityTracking();
    if (currentUserId) {
        try {
            await fetch("/api/mail/logout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: currentUserId })
            });
        } catch (e) {
            console.warn("Logout API call failed (backend may be offline):", e);
        }
    }
    // Clear state
    currentUserId = null;
    currentUserEmail = null;
    localStorage.removeItem(STORAGE_KEY_USER_ID);
    localStorage.removeItem(STORAGE_KEY_EMAIL);
    localStorage.removeItem(STORAGE_KEY_APP_PWD);
    // Clear login form fields
    document.getElementById("mail-email").value = "";
    document.getElementById("mail-apppwd").value = "";
    loginTip.textContent = "";
    incidents = [];
    renderIncidents();
    loginModal.classList.add("active");
    // Show auto-logout toast
    showLogoutToast();
    console.log("👋 Logged out");
}

// Perform local logout without calling backend (used for auto-logout where
// the backend already cleaned up the session). Mirrors logoutUser() minus the API call.
function performLocalLogout() {
    stopInactivityTracking();
    if (!currentUserId) return;  // already logged out
    currentUserId = null;
    currentUserEmail = null;
    localStorage.removeItem(STORAGE_KEY_USER_ID);
    localStorage.removeItem(STORAGE_KEY_EMAIL);
    localStorage.removeItem(STORAGE_KEY_APP_PWD);
    document.getElementById("mail-email").value = "";
    document.getElementById("mail-apppwd").value = "";
    loginTip.textContent = "";
    incidents = [];
    renderIncidents();
    // Rebuild sidebar to show "Sign In" state
    if (typeof initNav === 'function') initNav('overview');
    loginModal.classList.add("active");
    showLogoutToast();
    console.log("👋 Auto-logged out due to inactivity");
}

// Show a brief toast notification explaining the auto-logout
function showLogoutToast() {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast tier2';
    toast.style.borderColor = '#fbbf24';
    toast.innerHTML = `
        <div class="toast-title">⏰ Auto-Logged Out</div>
        <div class="toast-desc">You were signed out after 1 minute of inactivity to protect your account.</div>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
}

// Inactivity tracking functions (startInactivityTracking, stopInactivityTracking,
// resetInactivityTimer) are shared — defined in nav.js, loaded before this file.

const STORAGE_KEY_SERVER_START = 'comhub_server_start';

// On page load, check if there's a saved session in localStorage
async function checkSavedSession() {
    const savedUserId = localStorage.getItem(STORAGE_KEY_USER_ID);
    const savedEmail = localStorage.getItem(STORAGE_KEY_EMAIL);
    const savedAppPwd = localStorage.getItem(STORAGE_KEY_APP_PWD);

    // No saved credentials → first visit → show login modal
    if (!savedUserId || !savedEmail) {
        loginModal.classList.add("active");
        return false;
    }

    // ===== Detect server restart — force re-login =====
    try {
        const pingResp = await fetch("/api/ping");
        const pingData = await pingResp.json();
        const currentStart = pingData.server_start_time;
        const savedStart = localStorage.getItem(STORAGE_KEY_SERVER_START);

        if (savedStart && String(currentStart) !== String(savedStart)) {
            // Server restarted — clear old session, force manual re-login
            console.log("🔄 Server restart detected — forcing re-login");
            localStorage.removeItem(STORAGE_KEY_USER_ID);
            localStorage.removeItem(STORAGE_KEY_EMAIL);
            localStorage.removeItem(STORAGE_KEY_APP_PWD);
            localStorage.removeItem(STORAGE_KEY_SERVER_START);
            document.getElementById("mail-email").value = savedEmail; // pre-fill email
            document.getElementById("mail-apppwd").value = "";
            loginModal.classList.add("active");
            if (typeof initNav === 'function') initNav('overview');
            return false;
        }
    } catch (err) {
        // Backend unreachable — proceed with cached data only
        console.warn("⚠️ Backend unreachable — cannot verify session");
    }

    // Session still valid — restore as normal
    // Immediately restore identity from localStorage so dashboard loads instantly
    currentUserId = savedUserId;
    currentUserEmail = savedEmail;
    document.getElementById("mail-email").value = savedEmail;
    if (savedAppPwd) document.getElementById("mail-apppwd").value = savedAppPwd;

    // Show dashboard and load incidents right away (no waiting for IMAP login)
    if (typeof initNav === 'function') initNav('overview');
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    requestNotificationPermission();
    if (socket && socket.connected) socket.emit("bind_user", currentUserId);
    loadUserIncidents(); // fire-and-forget, don't await

    // Start inactivity tracking for restored session
    startInactivityTracking();

    // Re-establish IMAP session in the BACKGROUND — doesn't block the UI
    try {
        const response = await fetch("/api/mail/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: savedEmail, app_pwd: savedAppPwd })
        });
        const data = await response.json();
        if (data.code === 200) {
            console.log("📬 IMAP session re-established");
            localStorage.setItem(STORAGE_KEY_USER_ID, data.user_id);
            // Re-confirm server start time
            fetch("/api/ping").then(r => r.json()).then(d => {
                localStorage.setItem(STORAGE_KEY_SERVER_START, d.server_start_time);
            }).catch(() => {});
        } else {
            console.warn("⚠️ Background re-auth failed:", data.msg);
            // Don't show login modal — user can still view existing incidents
        }
    } catch (err) {
        console.warn("⚠️ Backend offline — viewing cached incidents only");
        // Don't show login modal — user can still browse existing data
    }

    return true;
}

async function loadUserIncidents() {
    if (!currentUserId) {
        console.warn("⚠️ loadUserIncidents skipped: currentUserId is null");
        return;
    }
    // Show skeleton loading
    const container = document.getElementById('incidents-container');
    if (container) {
        container.innerHTML = Array.from({ length: 4 }, () =>
            `<div class="skel-card skeleton"><div class="skel-line skeleton long"></div><div class="skel-line skeleton med"></div><div class="skel-line skeleton short"></div></div>`
        ).join('');
    }
    try {
        console.log("📡 Fetching incidents for user:", currentUserId);
        const res = await fetch(`/api/incidents?user_id=${currentUserId}`);
        console.log("📡 Response status:", res.status);
        const data = await res.json();
        console.log("📡 Response data:", data);
        if (data.code && data.code !== 200) {
            console.error("❌ Backend error:", data.msg);
            document.getElementById("incidents-container").innerHTML =
                `<div style="text-align:center;padding:40px;color:#f87171;">⚠️ ${data.msg}</div>`;
            return;
        }
        incidents = data.incidents || [];
        // Compute initial SLA remaining from absolute deadline (survives page refresh)
        const nowSec = Math.floor(Date.now() / 1000);
        incidents.forEach(inc => {
            if (inc.sla_deadline_ts) {
                inc._sla_remaining = Math.max(0, inc.sla_deadline_ts - nowSec);
            } else {
                inc._sla_remaining = inc.sla_countdown || 0;
            }
        });
        console.log("✅ Loaded", incidents.length, "incidents");
        renderIncidents();
        // If navigated from Map "View in Dashboard", scroll to & highlight the target
        const urlParams = new URLSearchParams(window.location.search);
        const highlightId = urlParams.get('highlight');
        if (highlightId) {
            // Slight delay so DOM is painted before scrolling
            setTimeout(() => highlightIncident(highlightId), 300);
        }
    } catch (err) {
        console.error("❌ Failed to load incident list:", err);
        document.getElementById("incidents-container").innerHTML =
            `<div style="text-align:center;padding:40px;color:#f87171;">❌ Failed to connect to backend. Is app.py running?</div>`;
    }
}

// Manual mailbox sync — scans recent Gmail emails and ingests only new ones.
// Already-recorded emails (matched by dedup hash) are automatically skipped.
async function syncMailbox() {
    if (!currentUserId) {
        alert("Please log in your email first");
        return;
    }
    const btn = document.getElementById("sync-btn");
    const originalText = btn ? btn.textContent : "📬 Sync Mailbox";
    if (btn) {
        btn.disabled = true;
        btn.textContent = "⏳ Scanning...";
        btn.style.opacity = "0.7";
    }
    try {
        const res = await fetch("/api/mail/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: currentUserId })
        });
        const data = await res.json();
        if (data.code === 200) {
            const msg = data.new_incidents > 0
                ? `📬 Found ${data.new_incidents} new email(s) (${data.skipped} skipped)`
                : `📬 No new emails — all ${data.total_scanned} scanned emails are already recorded`;
            console.log(msg);
            if (data.new_incidents > 0) {
                await loadUserIncidents();
            }
            // Brief toast-style feedback
            const tip = document.getElementById("login-tip");
            if (tip) {
                tip.style.color = data.new_incidents > 0 ? "#4ade80" : "#fbbf24";
                tip.textContent = msg;
                setTimeout(() => { tip.textContent = ""; }, 4000);
            }
        } else {
            alert(data.msg || "Sync failed");
        }
    } catch (err) {
        console.error("Sync error:", err);
        alert("Failed to connect to backend. Is app.py running?");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
            btn.style.opacity = "1";
        }
    }
}

// Render all incident cards
function renderIncidents() {
    const container = document.getElementById('incidents-container');
    // Exclude finished incidents from the main overview (they live on completed.html)
    let filteredList = currentFilter === 'all'
        ? incidents.filter(item => !item.finished)
        : incidents.filter(item => !item.finished && item.tier == currentFilter);

    // Search filter
    if (searchQuery.trim()) {
        const keyword = searchQuery.toLowerCase();
        filteredList = filteredList.filter(item =>
            item.title.toLowerCase().includes(keyword) ||
            item.description.toLowerCase().includes(keyword) ||
            item.id.toLowerCase().includes(keyword)
        );
    }

    // Sort & Paginate
    filteredList = sortIncidents(filteredList);
    const totalPages = Math.ceil(filteredList.length / PAGE_SIZE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    const pageList = paginateList(filteredList);

if (filteredList.length === 0) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">🛡️</div>
            <h3>All Clear!</h3>
            <p>No incidents match your current filters</p>
            <span class="empty-sub">Everything is running smoothly</span>
        </div>
    `;
    updateStats();
    return;
}

    container.innerHTML = pageList.map(inc => {
        const newClass = inc._isNew ? ' new' : '';
        const sourceIcon = { gmail: '📧', datadog: '🐶', syslog: '📡', generic: '🔗' };
        const conf = inc.confidence || 0;
        const confColor = conf >= 80 ? '#4ade80' : conf >= 60 ? '#fbbf24' : conf >= 40 ? '#fb923c' : '#f87171';
        const slaRing = inc.status === 'active' ? renderSLAring(inc) : null;
        const slaRemaining = inc._sla_remaining !== undefined ? inc._sla_remaining
            : inc.sla_deadline_ts ? Math.max(0, inc.sla_deadline_ts - Math.floor(Date.now() / 1000)) : inc.sla_countdown;
        return `
        <div class="incident-card tier-${inc.tier}${newClass}" onclick="openModal('${inc.id}')">
            <div class="incident-header">
                <span class="incident-id">${inc.id}</span>
                <span class="tier-badge tier${inc.tier}" title="${inc.tier === 1 ? 'Critical: Immediate action required' : inc.tier === 2 ? 'Medium: Action within 1 hour' : 'Low: Routine, no immediate action needed'}">${inc.tier_label}</span>
            </div>
            <div class="incident-title">${inc.title}</div>
            <div class="incident-desc">${inc.description}</div>
            <div class="incident-footer">
                <span>${sourceIcon[inc.source] || '📋'} ${inc.source} | ${inc.created_at}</span>
                ${inc.status === 'active' && slaRemaining > 0 ?
            `<span class="sla-ring-wrap">
                ${slaRing.svg}
                <span class="countdown sla-countdown sla-${slaRing.cls}" data-incident-id="${inc.id}">${formatTime(slaRemaining)}</span>
            </span>` :
            inc.status === 'resolved' ? `<span style="color:#22c55e">Resolved</span>` :
            `<span class="sla-ring-wrap">
                ${slaRing ? slaRing.svg : ''}
                <span class="countdown sla-countdown sla-expired" data-incident-id="${inc.id}">Expired</span>
            </span>`}
            </div>
            <div class="confidence-row">
                <span class="confidence-label">🤖 AI</span>
                <div class="confidence-track">
                    <div class="confidence-fill" style="width:${conf}%; --conf-color:${confColor};"></div>
                </div>
                <span class="confidence-pct">${conf}%</span>
            </div>
            <div style="margin-top:10px; display:flex; gap:8px; justify-content:flex-end;" onclick="event.stopPropagation()">
                <button class="ack-btn ${inc.acknowledged ? 'acked' : ''}"
                        onclick="acknowledge('${inc.id}')"
                        ${inc.acknowledged ? 'disabled' : ''}>
                    ${inc.acknowledged ? '✓ Acknowledged' : 'Acknowledge'}
                </button>
                <button class="finish-btn" onclick="finishIncident('${inc.id}')" title="Mark as Finished">
                    ✅ Finish
                </button>
            </div>
        </div>
    `;
    }).join('');

    // Attach animationend listeners so the "new" glow cleans up naturally.
    // (Before the targeted-SLA fix, the per-second full re-render kept
    // restarting these animations — now they run to completion once.)
    container.querySelectorAll('.incident-card.new').forEach(card => {
        card.addEventListener('animationend', function handler(e) {
            // cardAppear (0.4s) ends first for non-critical cards;
            // glowPulse (2s×3 + 0.5s delay = 6.5s) is the final one for tier-1.
            // Wait for the last animation before removing the class.
            if (e.animationName === 'glowPulse' || e.animationName === 'cardAppear') {
                card.classList.remove('new');
                card.removeEventListener('animationend', handler);
                // Also clear the flag on the data model (no full re-render needed)
                const countdownEl = card.querySelector('.sla-countdown');
                if (countdownEl) {
                    const inc = incidents.find(i => i.id === countdownEl.dataset.incidentId);
                    if (inc) inc._isNew = false;
                }
            }
        });
    });

    updateStats();
}

// Highlight and scroll to a specific incident card (called from Map "View in Dashboard")
function highlightIncident(incId) {
    var container = document.getElementById('incidents-container');
    if (!container) return;

    // Reset any active tier filter so the target incident is visible
    if (currentFilter !== 'all') {
        currentFilter = 'all';
        renderIncidents();
    }

    var allCards = container.querySelectorAll('.incident-card');
    var targetCard = null;
    allCards.forEach(function(card) {
        var oc = card.getAttribute('onclick') || '';
        if (oc.indexOf("'" + incId + "'") !== -1 || oc.indexOf('"' + incId + '"') !== -1) {
            targetCard = card;
        }
    });

    if (!targetCard) {
        console.warn("Incident " + incId + " not found in current view");
        return;
    }

    container.querySelectorAll('.incident-card.highlight-target').forEach(function(c) { c.classList.remove('highlight-target'); });
    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetCard.classList.add('highlight-target');
    setTimeout(function() { targetCard.classList.remove('highlight-target'); }, 5000);
    setTimeout(function() { openModal(incId); }, 600);

    var url = new URL(window.location);
    url.searchParams.delete('highlight');
    window.history.replaceState({}, document.title, url.toString());
}

// Update top statistics cards
function updateStats() {
    const activeItems = incidents.filter(i => i.status === 'active');
    const tier1 = incidents.filter(i => i.tier === 1).length;
    const tier2 = incidents.filter(i => i.tier === 2).length;
    const tier3 = incidents.filter(i => i.tier === 3).length;
    const total = incidents.length;

    document.getElementById('tier1-count').textContent = tier1;
    document.getElementById('tier2-count').textContent = tier2;
    document.getElementById('tier3-count').textContent = tier3;
    document.getElementById('active-count').textContent = activeItems.length;

    // Burger sidebar quick stats
    const qc = document.getElementById('quick-critical');
    const qm = document.getElementById('quick-medium');
    const ql = document.getElementById('quick-low');
    const qt = document.getElementById('quick-total');
    if (qc) qc.textContent = tier1;
    if (qm) qm.textContent = tier2;
    if (ql) ql.textContent = tier3;
    if (qt) qt.textContent = total;

    // Update mini chart
    const totalIncidents = incidents.length || 1;
    const percentage = Math.min((activeItems.length / totalIncidents) * 100, 100);
    const chart = document.getElementById('active-chart');
    if (chart) {
        chart.style.width = percentage + '%';
    }

    // Update sparkline history
    updateSparklines(tier1, tier2, tier3);
}

// ─── Sparklines ────────────────────────────────────────────────────
const SPARK_HISTORY_KEY = 'comhub_spark_history';
const SPARK_MAX_POINTS = 12;
let sparkHistory = loadJson(SPARK_HISTORY_KEY, { t1: [], t2: [], t3: [] });
let sparkCharts = {};

function updateSparklines(t1, t2, t3) {
    sparkHistory.t1.push(t1);
    sparkHistory.t2.push(t2);
    sparkHistory.t3.push(t3);
    if (sparkHistory.t1.length > SPARK_MAX_POINTS) { sparkHistory.t1.shift(); sparkHistory.t2.shift(); sparkHistory.t3.shift(); }
    saveJson(SPARK_HISTORY_KEY, sparkHistory);

    drawSparkline('sparkline-t1', sparkHistory.t1, '#f87171');
    drawSparkline('sparkline-t2', sparkHistory.t2, '#fbbf24');
    drawSparkline('sparkline-t3', sparkHistory.t3, '#4ade80');
}

function drawSparkline(canvasId, data, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || data.length < 2) return;

    // Destroy old chart if exists
    if (sparkCharts[canvasId]) { sparkCharts[canvasId].destroy(); }

    const ctx = canvas.getContext('2d');
    sparkCharts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map((_, i) => ''),
            datasets: [{
                data: data,
                borderColor: color,
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.3,
                fill: false
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            animation: { duration: 300 },
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
                x: { display: false },
                y: { display: false, min: Math.max(0, Math.min(...data) - 1) }
            },
            elements: { line: { borderJoinStyle: 'round' } }
        }
    });
}

// Convert seconds to a human-readable string
function formatTime(seconds) {
    if (seconds <= 0) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

// Mark incident as acknowledged
async function acknowledge(id) {
    if (!currentUserId) return alert("Please log in your email first");
    const targetInc = incidents.find(item => item.id === id);
    if (!targetInc) return;

    try {
        const res = await fetch(`/api/incidents/${id}/ack`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: currentUserId })
        });
        const data = await res.json();
        if (data.code !== 200) {
            alert("❌ " + (data.msg || "Failed to acknowledge"));
            return;
        }
    } catch (err) {
        alert("❌ Failed to connect to backend. Is app.py running?");
        return;
    }

    targetInc.acknowledged = true;
    targetInc.acknowledged_by = 'Current Operator';
    renderIncidents();
    if (currentModalId === id) {
        updateModalContent(targetInc);
    }
}

// Custom confirm dialog — replaces ugly browser confirm()
function showConfirm(title, body, okText = 'Yes, Finish It') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirm-overlay');
        const titleEl = document.getElementById('confirm-title');
        const bodyEl = document.getElementById('confirm-body');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');

        titleEl.textContent = title;
        bodyEl.textContent = body;
        okBtn.textContent = okText;

        function cleanup() {
            overlay.classList.remove('active');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onOverlay);
        }

        function onOk() { cleanup(); resolve(true); }
        function onCancel() { cleanup(); resolve(false); }
        function onOverlay(e) {
            if (e.target === overlay) { cleanup(); resolve(false); }
        }

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onOverlay);
        overlay.classList.add('active');
    });
}

// Mark incident as finished (resolved) — moves to Completed page
async function finishIncident(id) {
    if (!currentUserId) return alert("Please log in your email first");
    const targetInc = incidents.find(item => item.id === id);
    if (!targetInc) return;
    const ok = await showConfirm(
        'Mark as Finished?',
        `"${targetInc.title}" will be marked as resolved and moved to the Completed page.`,
        '✅ Yes, Finish It'
    );
    if (!ok) return;

    try {
        const res = await fetch(`/api/incidents/${id}/finish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: currentUserId })
        });
        const data = await res.json();
        if (data.code !== 200) {
            alert("❌ " + (data.msg || "Failed to finish incident"));
            return;
        }
    } catch (err) {
        alert("❌ Failed to connect to backend. Is app.py running?");
        return;
    }

    // Only update local state AFTER backend confirms success
    targetInc.finished = true;
    targetInc.status = 'resolved';
    targetInc.acknowledged = true;
    targetInc.acknowledged_by = targetInc.acknowledged_by || 'Current Operator';

    // Close modal if open for this incident
    if (currentModalId === id) {
        const modal = document.getElementById('detail-modal');
        modal.classList.remove('active');
        currentModalId = null;
    }
    renderIncidents();
}

// Incident detail modal control
function openModal(id) {
    const targetInc = incidents.find(item => item.id === id);
    if (!targetInc) return;

    currentModalId = id;
    updateModalContent(targetInc);

    const modal = document.getElementById('detail-modal');
    modal.classList.add('active');
}
function closeModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('detail-modal');
    modal.classList.remove('active');
    currentModalId = null;
}

// Toggle full email content in detail modal
function toggleEmailContent() {
    const fullBody = document.getElementById('modal-full-body');
    const icon = document.getElementById('email-expand-icon');
    if (fullBody.style.display === 'none') {
        fullBody.style.display = 'block';
        icon.textContent = '▲';
    } else {
        fullBody.style.display = 'none';
        icon.textContent = '▼';
    }
}
function updateModalContent(inc) {
    document.getElementById('modal-id').textContent = inc.id;
    document.getElementById('modal-title').textContent = inc.title;
    document.getElementById('modal-desc').textContent = inc.description;
    document.getElementById('modal-source').textContent = inc.source;
    document.getElementById('modal-status').textContent = inc.status.charAt(0).toUpperCase() + inc.status.slice(1);
    document.getElementById('modal-time').textContent = inc.created_at;
    const modalSlaRemaining = inc._sla_remaining !== undefined ? inc._sla_remaining
        : inc.sla_deadline_ts ? Math.max(0, inc.sla_deadline_ts - Math.floor(Date.now() / 1000)) : inc.sla_countdown;
    document.getElementById('modal-sla').textContent = modalSlaRemaining > 0 ? formatTime(modalSlaRemaining) : 'Expired';

    const tierBadge = document.getElementById('modal-tier');
    tierBadge.textContent = inc.tier_label;
    tierBadge.className = `tier-badge tier${inc.tier}`;
    tierBadge.title = inc.tier === 1 ? '🔴 Critical: Immediate action required' : inc.tier === 2 ? '🟡 Medium: Action within 1 hour' : '🟢 Low: Routine, no immediate action needed';

    // AI Classification Reason
    const reasonBox = document.getElementById('modal-reason-box');
    const reasonText = document.getElementById('modal-reason');
    if (inc.classification_reason && inc.classification_reason !== 'Fallback') {
        reasonBox.style.display = 'block';
        reasonText.textContent = inc.classification_reason;
        reasonText.style.color = '';
    } else {
        reasonBox.style.display = 'none';
    }

    // Full Email Content Section
    const emailSection = document.getElementById('modal-email-section');
    const fullBody = document.getElementById('modal-full-body');
    if (inc.full_body && inc.full_body.length > inc.description.length) {
        emailSection.style.display = 'block';
        fullBody.style.display = 'none';
        fullBody.textContent = inc.full_body;
        document.getElementById('email-expand-icon').textContent = '▼';
    } else {
        emailSection.style.display = 'none';
    }

    const ackedDisplay = document.getElementById('modal-acked');
    ackedDisplay.textContent = inc.acknowledged
        ? `Yes - ${inc.acknowledged_by || 'Operator'}`
        : 'No - Pending';
    ackedDisplay.style.color = inc.acknowledged ? '#22c55e' : '#f87171';

    const channelMap = { 1: 'SMS + Voice Broadcast + Team Push', 2: 'Team Push Notifications', 3: 'Silent Log Only' };
    document.getElementById('modal-channel').textContent = channelMap[inc.tier];

    // AI Confidence
    const confEl = document.getElementById('modal-confidence');
    if (confEl) {
        const c = inc.confidence || 0;
        confEl.textContent = c + '%';
        confEl.style.color = c >= 80 ? '#4ade80' : c >= 50 ? '#fbbf24' : '#f87171';
    }

    const ackButton = document.getElementById('modal-ack-btn');
    if (inc.acknowledged) {
        ackButton.textContent = '✓ Acknowledged';
        ackButton.classList.add('acked');
        ackButton.disabled = true;
    } else {
        ackButton.textContent = 'Acknowledge Alert';
        ackButton.classList.remove('acked');
        ackButton.disabled = false;
        ackButton.onclick = () => acknowledge(inc.id);
    }

    const finishButton = document.getElementById('modal-finish-btn');
    if (finishButton) {
        finishButton.onclick = () => finishIncident(inc.id);
    }

    // Reset reclassify dropdown when opening a new incident
    const reclassifySel = document.getElementById('modal-reclassify-select');
    if (reclassifySel) { reclassifySel.style.display = 'none'; reclassifySel.value = ''; }
}

// Show / hide the manual reclassify tier dropdown
function toggleReclassify() {
    const sel = document.getElementById('modal-reclassify-select');
    sel.style.display = sel.style.display === 'none' ? 'inline-block' : 'none';
}

// Submit a manual tier override to the backend
async function doReclassify(newTier) {
    if (!newTier || !currentModalId) return;
    if (!currentUserId) { console.warn('No user logged in'); return; }
    try {
        const res = await fetch(`/api/incidents/${currentModalId}/reclassify_manual`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUserId,
                tier: parseInt(newTier),
                reason: 'Manual override from dashboard'
            })
        });
        const data = await res.json();
        if (data.code === 200) {
            // Refresh local incident list
            await loadUserIncidents();
            // Update modal with the new tier
            const updated = incidents.find(i => i.id === currentModalId);
            if (updated) updateModalContent(updated);
        } else {
            console.error('Reclassify failed:', data.msg);
        }
    } catch (err) {
        console.error('Reclassify error:', err);
    }
    document.getElementById('modal-reclassify-select').style.display = 'none';
}

// ─── Sort & Pagination State ────────────────────────────────────────
let sortField = 'time';
let sortDir = -1; // -1 = newest first (desc), 1 = oldest first (asc)
let currentPage = 1;
const PAGE_SIZE = 20;

function applySort() {
    sortField = document.getElementById('sort-field').value;
    currentPage = 1;
    renderIncidents();
}

function toggleSortDir() {
    sortDir = sortDir === 1 ? -1 : 1;
    const btn = document.getElementById('sort-dir-btn');
    btn.textContent = sortDir === 1 ? '↑ Asc' : '↓ Desc';
    currentPage = 1;
    renderIncidents();
}

function goPage(delta) {
    currentPage += delta;
    renderIncidents();
    document.getElementById('incidents-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function sortIncidents(list) {
    return list.slice().sort((a, b) => {
        let va, vb;
        switch (sortField) {
            case 'tier':
                va = a.tier || 99; vb = b.tier || 99;
                break;
            case 'sla': {
                const slaA = a._sla_remaining !== undefined ? a._sla_remaining
                    : a.sla_deadline_ts ? Math.max(0, a.sla_deadline_ts - Math.floor(Date.now() / 1000)) : (a.sla_countdown || 0);
                const slaB = b._sla_remaining !== undefined ? b._sla_remaining
                    : b.sla_deadline_ts ? Math.max(0, b.sla_deadline_ts - Math.floor(Date.now() / 1000)) : (b.sla_countdown || 0);
                va = slaA; vb = slaB;
                break;
            }
            case 'confidence':
                va = a.confidence || 0; vb = b.confidence || 0;
                break;
            case 'title':
                va = (a.title || '').toLowerCase(); vb = (b.title || '').toLowerCase();
                break;
            case 'time':
            default:
                va = a.created_at || ''; vb = b.created_at || '';
                break;
        }
        if (va < vb) return -1 * sortDir;
        if (va > vb) return 1 * sortDir;
        return 0;
    });
}

function paginateList(list) {
    const totalPages = Math.ceil(list.length / PAGE_SIZE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * PAGE_SIZE;
    const page = list.slice(start, start + PAGE_SIZE);

    // Update pagination UI
    const pagEl = document.getElementById('pagination');
    if (pagEl) {
        pagEl.style.display = list.length > PAGE_SIZE ? 'flex' : 'none';
        document.getElementById('page-info').textContent = `Page ${currentPage} of ${totalPages} (${list.length} items)`;
        document.getElementById('page-prev').disabled = currentPage <= 1;
        document.getElementById('page-next').disabled = currentPage >= totalPages;
    }

    return page;
}

// filterByTier function — used by stat cards and burger sidebar menu items
function filterByTier(tier) {
    currentFilter = tier;
    currentPage = 1;
    // Update filter bar button active states
    document.querySelectorAll('.filter-btn-emoji').forEach(b => {
        b.classList.remove('active');
        if (b.dataset.filter === String(tier)) {
            b.classList.add('active');
        }
    });
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('active');
        if (b.dataset.filter === String(tier)) {
            b.classList.add('active');
        }
    });
    renderIncidents();
}

// Tier filter button click — BOTH filter-btn (pipeline page) and filter-btn-emoji (overview page)
document.querySelectorAll('.filter-btn, .filter-btn-emoji').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn, .filter-btn-emoji').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderIncidents();
    });
});

// Search input handler
function handleSearch(inputValue) {
    searchQuery = inputValue;
    currentPage = 1;
    renderIncidents();
}

// SLA countdown timer — updates every second.
// Computes remaining time from absolute sla_deadline_ts so refreshes don't reset it.
// Migrates old incidents that only have sla_countdown (no sla_deadline_ts).
setInterval(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    incidents.forEach(item => {
        if (item.status === 'active') {
            if (item.sla_deadline_ts) {
                item._sla_remaining = Math.max(0, item.sla_deadline_ts - nowSec);
            } else {
                // Migrate old-format incident: compute deadline from created_at + sla_countdown
                if (!item._sla_remaining && item._sla_remaining !== 0) {
                    item._sla_remaining = item.sla_countdown || 0;
                }
                if (item._sla_remaining > 0) {
                    item._sla_remaining--;
                }
            }
        }
    });
    document.querySelectorAll('.sla-countdown').forEach(el => {
        const incId = el.dataset.incidentId;
        const inc = incidents.find(i => i.id === incId);
        if (inc && inc.status === 'active') {
            const ring = renderSLAring(inc);
            // Update text
            const remaining = inc._sla_remaining !== undefined ? inc._sla_remaining
                : inc.sla_deadline_ts ? Math.max(0, inc.sla_deadline_ts - Math.floor(Date.now() / 1000)) : inc.sla_countdown;
            el.textContent = remaining > 0 ? formatTime(remaining) : 'Expired';
            // Update color class
            el.className = `countdown sla-countdown sla-${ring.cls}`;
            // Update ring SVG if present
            const wrap = el.closest('.sla-ring-wrap');
            if (wrap) {
                const progressCircle = wrap.querySelector('.sla-ring-progress');
                if (progressCircle) {
                    progressCircle.setAttribute('stroke-dashoffset', (RING_CIRCUMFERENCE * (1 - ring.pct / 100)).toFixed(2));
                    progressCircle.setAttribute('class', `sla-ring-progress ${ring.cls}`);
                }
            }
        }
    });
}, 1000);

// ─── SLA Ring Helper ─────────────────────────────────────────────────
const SLA_TOTAL = { 1: 480, 2: 2400, 3: 14400 }; // seconds per tier
const RING_CIRCUMFERENCE = 2 * Math.PI * 14; // r=14 → ~87.96

function renderSLAring(inc) {
    const remaining = inc._sla_remaining !== undefined ? inc._sla_remaining
        : inc.sla_deadline_ts ? Math.max(0, inc.sla_deadline_ts - Math.floor(Date.now() / 1000))
        : (inc.sla_countdown || 0);
    const total = SLA_TOTAL[inc.tier] || 2400;
    const pct = total > 0 ? Math.min(100, Math.max(0, (remaining / total) * 100)) : 0;
    let cls, color;
    if (remaining <= 0)      { cls = 'expired'; color = '#991b1b'; }
    else if (pct < 25)       { cls = 'danger';  color = '#ef4444'; }
    else if (pct < 50)       { cls = 'warn';    color = '#eab308'; }
    else                     { cls = 'safe';    color = '#22c55e'; }
    const offset = RING_CIRCUMFERENCE * (1 - pct / 100);
    return {
        svg: `<svg class="sla-ring" viewBox="0 0 36 36" width="28" height="28">
            <circle class="sla-ring-bg" cx="18" cy="18" r="14"/>
            <circle class="sla-ring-progress ${cls}" cx="18" cy="18" r="14"
                stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}"
                stroke-dashoffset="${offset.toFixed(2)}"
                transform="rotate(-90 18 18)"/>
        </svg>`,
        cls: cls,
        pct: pct
    };
}

// ===== WebSocket Real-time Connection =====
try {
    socket = io();  // auto-connect to the same origin that served the page
    socket.on('connect', () => {
        console.log('✅ Socket connected, id:', socket.id);
        if (currentUserId) {
            socket.emit("bind_user", currentUserId);
            console.log('📤 Re-sent bind_user on reconnect:', currentUserId);
        }
    });
    socket.on('disconnect', (reason) => {
        console.log('🔌 Socket disconnected:', reason);
    });
    socket.on('new_incident', (payload) => {
        // Broadcast format: {client_user_id, incident}
        const incident = payload.incident || payload;
        const msgUserId = payload.client_user_id;
        // Filter: only process if this incident belongs to the current user
        if (msgUserId && currentUserId && msgUserId !== currentUserId) {
            console.log('📩 Skipping incident for other user:', msgUserId);
            return;
        }
        console.log('📩 WebSocket new_incident:', incident);
        if (incidents.find(i => i.id === incident.id)) {
            console.log('  ↳ Already in list, skipping');
            return;
        }
        incident._isNew = true;  // flag for card animation
        incidents.unshift(incident);
        notifyNewIncident(incident);
        renderIncidents();
        // Clear the flag after the animation has had time to play. Without this,
        // the per-second SLA countdown re-render keeps recreating this card's DOM
        // node with the "new" class every second, restarting the glow animation
        // forever instead of playing it once.
        setTimeout(() => {
            incident._isNew = false;
            renderIncidents();
        }, 3000);
    });
    socket.on('incident_updated', (payload) => {
        const incident = payload.incident || payload;
        const msgUserId = payload.client_user_id;
        if (msgUserId && currentUserId && msgUserId !== currentUserId) return;
        const index = incidents.findIndex(item => item.id === incident.id);
        if (index >= 0) {
            incidents[index] = incident;
            renderIncidents();
        }
    });
    socket.on('sync_complete', (payload) => {
        const msgUserId = payload.client_user_id;
        if (msgUserId && currentUserId && msgUserId !== currentUserId) return;
        console.log(`📬 Initial sync complete: ${payload.new_incidents} new, ${payload.skipped} skipped`);
        if (payload.new_incidents > 0) {
            loadUserIncidents();
        }
    });
    // Force logout event from backend (inactivity auto-logout)
    socket.on('force_logout', (payload) => {
        const msgUserId = payload.client_user_id;
        if (msgUserId && currentUserId && msgUserId !== currentUserId) return;
        console.log('⏰ Force logout from server:', payload.reason);
        performLocalLogout();
    });
    socket.on('connect_error', () => {
        console.log('⚠️ Backend server offline - start backend first');
    });
} catch (e) {
    console.log('Socket.IO script missing, running offline demo mode');
}

// Page initial load logic — try to restore saved session first
checkSavedSession().then(restored => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('showLogin') === 'true') {
        loginModal.classList.add("active");
    } else if (!restored) {
        incidents = [];
        renderIncidents();
        // Ensure login modal is visible on first visit
        loginModal.classList.add("active");
    }
    // Check for tier filter in URL query string (e.g. /?tier=1 from pipeline page)
    const tierParam = urlParams.get('tier');
    if (tierParam) {
        filterByTier(tierParam);
        // Clean up URL without reloading
        window.history.replaceState({}, document.title, '/');
    }
});

// Polling fallback: reload incidents every 30 seconds
// Only runs when WebSocket is disconnected (acts as a safety net)
setInterval(() => {
    if (currentUserId && (!socket || !socket.connected)) {
        loadUserIncidents();
    }
}, 30000);


// ===== ENHANCED LIVE METRICS (Step 3) =====
function updateLiveMetrics() {
    // Update clock
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    const timeElement = document.getElementById('live-time');
    if (timeElement) {
        timeElement.textContent = timeStr;
    }
    
    // Update incident count
    const countElement = document.getElementById('incident-count');
    if (countElement) {
        countElement.textContent = incidents.length;
    }
}

// Update every second
setInterval(updateLiveMetrics, 1000);

// Also update when incidents change
function updateIncidentCount() {
    const countElement = document.getElementById('incident-count');
    if (countElement) {
        countElement.textContent = incidents.length;
    }
}

// Override renderIncidents to also update the count
const originalRender = renderIncidents;
renderIncidents = function() {
    originalRender();
    updateIncidentCount();
};

