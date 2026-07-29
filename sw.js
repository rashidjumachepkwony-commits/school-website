// ============================================
// SERVICE WORKER - Offline & App-like Experience
// ============================================

const CACHE_NAME = 'changara-star-v1';
const STATIC_ASSETS = [
    'student-portal.html',
    'index.html',
    'about.html',
    'academics.html',
    'contact.html',
    'portal.html',
    'manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// ============================================
// INSTALL - Cache core assets
// ============================================
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('📦 Caching core assets...');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(function() {
                console.log('✅ Assets cached!');
                return self.skipWaiting();
            })
            .catch(function(error) {
                console.error('❌ Cache error:', error);
            })
    );
});

// ============================================
// ACTIVATE - Clean old caches
// ============================================
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(function() {
            console.log('✅ Service Worker activated!');
            return self.clients.claim();
        })
    );
});

// ============================================
// FETCH - Serve from cache, fallback to network
// ============================================
self.addEventListener('fetch', function(event) {
    // Skip cross-origin requests
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(function(cachedResponse) {
                if (cachedResponse) {
                    // Return cached version (fast!)
                    return cachedResponse;
                }
                
                // Try network and cache for future
                return fetch(event.request)
                    .then(function(networkResponse) {
                        // Only cache successful responses
                        if (networkResponse && networkResponse.status === 200) {
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then(function(cache) {
                                    cache.put(event.request, responseClone);
                                });
                        }
                        return networkResponse;
                    })
                    .catch(function() {
                        // Offline fallback
                        return new Response(
                            `
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <meta charset="UTF-8">
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                <title>Offline - Changara Star Academy</title>
                                <style>
                                    body {
                                        font-family: 'Segoe UI', Arial, sans-serif;
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                        height: 100vh;
                                        background: linear-gradient(135deg, #0A1628, #1a2a4a);
                                        color: white;
                                        text-align: center;
                                        padding: 20px;
                                    }
                                    .offline-box {
                                        max-width: 400px;
                                        padding: 40px;
                                        background: rgba(255,255,255,0.05);
                                        border-radius: 20px;
                                        border: 1px solid rgba(255,255,255,0.1);
                                    }
                                    .offline-box .icon { font-size: 64px; display: block; margin-bottom: 15px; }
                                    .offline-box h1 { font-size: 24px; color: #C9A84C; }
                                    .offline-box p { color: rgba(255,255,255,0.6); margin-top: 10px; }
                                    .offline-box .btn {
                                        display: inline-block;
                                        margin-top: 20px;
                                        padding: 12px 30px;
                                        background: #C9A84C;
                                        color: #0A1628;
                                        text-decoration: none;
                                        border-radius: 10px;
                                        font-weight: 700;
                                    }
                                </style>
                            </head>
                            <body>
                                <div class="offline-box">
                                    <span class="icon">📡</span>
                                    <h1>You're Offline</h1>
                                    <p>Please check your internet connection and try again.</p>
                                    <a href="/" class="btn">🔄 Retry</a>
                                </div>
                            </body>
                            </html>
                            `,
                            { headers: { 'Content-Type': 'text/html' } }
                        );
                    });
            })
    );
});

// ============================================
// PUSH NOTIFICATIONS (Optional)
// ============================================
self.addEventListener('push', function(event) {
    const data = event.data ? event.data.json() : {};
    const title = data.title || '📢 Changara Star Academy';
    const options = {
        body: data.body || 'New update from your school.',
        icon: 'logo-192.png',
        badge: 'logo-192.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/student-portal.html'
        }
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// ============================================
// NOTIFICATION CLICK
// ============================================
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    const url = event.notification.data.url || '/student-portal.html';
    event.waitUntil(
        clients.openWindow(url)
    );
});