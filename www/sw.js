const CACHE_NAME = 'almezo-v5';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// تمرير طلبات البث والبروكسي و Firestore مباشرة بدون اعتراض
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // تجاوز كامل لطلبات البروكسي والبث المباشر والفيديو - لا تعترضها أبداً
    // + تجاوز طلبات Firestore/Firebase الحية (Listen channel) لأنها اتصال streaming مستمر
    //   والتدخل فيها بالـ Service Worker يكسرها ويطلع الخطأ:
    //   "ServiceWorker intercepted the request and encountered an unexpected error"
    if (
        url.includes('proxy.php') ||
        url.includes('.m3u8') ||
        url.includes('.ts') ||
        url.includes('.mp4') ||
        url.includes('.mkv') ||
        url.includes('.avi') ||
        url.includes('player_api.php') ||
        url.includes('/live/') ||
        url.includes('/movie/') ||
        url.includes('/series/') ||
        url.includes('firestore.googleapis.com') ||
        url.includes('firebaseio.com') ||
        url.includes('googleapis.com') ||
        url.includes('gstatic.com') ||
        event.request.method !== 'GET' ||
        event.request.headers.get('range')
    ) {
        return; // لا تستدعي event.respondWith - دع المتصفح يتعامل مباشرة
    }

    // باقي الطلبات العادية (HTML, CSS, JS, صور)
    event.respondWith(
        fetch(event.request).catch(() => {
            return new Response('Offline mode active.');
        })
    );
});
