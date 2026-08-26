/**
 * InciCare Shared Utility Library
 * Common functions used across all dashboard pages.
 * Include this before other page scripts.
 */

// ─── Particles Background ────────────────────────────────────────────
function createParticles(count = 20) {
    const container = document.getElementById('particles');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        const size = Math.random() * 4 + 2;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.animationDuration = (Math.random() * 20 + 15) + 's';
        p.style.animationDelay = (Math.random() * 20) + 's';
        p.style.opacity = Math.random() * 0.3 + 0.1;
        container.appendChild(p);
    }
}

// ─── Live Clock ───────────────────────────────────────────────────────
function startClock(elementId) {
    const update = () => {
        const el = document.getElementById(elementId);
        if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
    };
    update();
    return setInterval(update, 1000);
}

// ─── Time Formatting ──────────────────────────────────────────────────
function formatTime(seconds) {
    if (seconds == null || isNaN(seconds) || seconds < 0) return 'Expired';
    const totalSec = Math.floor(seconds);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function relativeTime(dateStr) {
    if (!dateStr) return '';
    const then = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── API Helpers ──────────────────────────────────────────────────────
function getUserId() {
    return localStorage.getItem('comhub_user_id') || '';
}

function getCurrentUserEmail() {
    return localStorage.getItem('comhub_email') || '';
}

async function apiGet(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
    return res.json();
}

async function apiPost(path, body = {}) {
    const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
    return res.json();
}

async function fetchIncidents(userId) {
    const id = userId || getUserId();
    if (!id) return [];
    const data = await apiGet(`/api/incidents?user_id=${id}`);
    return data.incidents || [];
}

// ─── Toast Notifications ──────────────────────────────────────────────
function showToast(type, title, msg, durationMs = 5000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { ok: '✅', err: '❌', warn: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || 'ℹ️'}</div>
        <div class="toast-body">
            <div class="toast-title">${title}</div>
            ${msg ? '<div class="toast-msg">' + msg + '</div>' : ''}
        </div>
        <button class="toast-close" onclick="this.closest('.toast').remove()">×</button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, durationMs);
}

// ─── Debounce ─────────────────────────────────────────────────────────
function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ─── DOM Helpers ──────────────────────────────────────────────────────
function $(selector) {
    return document.querySelector(selector);
}

function $$(selector) {
    return document.querySelectorAll(selector);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── Storage Helpers ──────────────────────────────────────────────────
function loadJson(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
}

function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

// ─── Service Worker Registration ──────────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}

// ─── Initialization ───────────────────────────────────────────────────
// Auto-create particles if a #particles container exists
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('particles')) {
        createParticles();
    }
});
