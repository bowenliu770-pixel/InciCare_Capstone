// InciCare Service Worker — Cache-first for assets, Network-first for HTML
const CACHE_NAME = 'comhub-v3';
const STATIC_ASSETS = [
    '/',
    '/style.css',
    '/nav.css',
    '/map.css',
    '/pipeline.css',
    '/utils.js',
    '/nav.js',
    '/app.js',
    '/map.js',
    '/pipeline.js',
    '/manifest.json'
];

// Install — pre-cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS).catch(() => {});
        })
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
        })
    );
    self.clients.claim();
});

// Fetch — cache-first for static, network-first for HTML/API
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    const isHtml = event.request.headers.get('accept')?.includes('text/html') ||
        url.pathname === '/' || url.pathname.endsWith('.html');
    const isApi = url.pathname.startsWith('/api/');

    const isJs = url.pathname.endsWith('.js');

    if (isApi || isHtml || isJs) {
        // Network-first for API, HTML, and JS — always get latest
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (event.request.method === 'GET') {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
    } else {
        // Cache-first for static assets (CSS, images, CDN)
        event.respondWith(
            caches.match(event.request).then(cached => {
                return cached || fetch(event.request).then(response => {
                    if (event.request.method === 'GET') {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                });
            })
        );
    }
});
