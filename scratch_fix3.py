import os

# 1. Update firebase-config.js to enable persistence
with open("firebase-config.js", "r", encoding="utf-8") as f:
    fc_content = f.read()

persistence_code = """const db       = firebase.firestore();

// تفعيل الكاش المحلي للفايربيز (Offline Persistence) لسرعة صاروخية
db.enablePersistence().catch(function(err) {
  if (err.code == 'failed-precondition') {
      console.warn("Multiple tabs open, persistence can only be enabled in one tab at a a time.");
  } else if (err.code == 'unimplemented') {
      console.warn("The current browser does not support all of the features required to enable persistence");
  }
});
"""

if "db.enablePersistence()" not in fc_content:
    fc_content = fc_content.replace("const db       = firebase.firestore();\n", persistence_code)
    with open("firebase-config.js", "w", encoding="utf-8") as f:
        f.write(fc_content)
    print("Updated firebase-config.js")

# 2. Update sw.js for Stale-While-Revalidate
sw_content = """// =============================================
// Service Worker for AlMeZ0 Servers PWA (Stale-While-Revalidate)
// =============================================

const CACHE_NAME = 'almez0-pwa-v8';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './ui.js',
  './firebase-config.js',
  './validation.js',
  './whatsapp.js',
  './photo/logo.ico',
  './photo/logo-192.png',
  './photo/logo-512.png',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => console.warn(err));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  
  // استثناء روابط فايربيز والـ API لعدم تداخل الكاش مع onSnapshot
  if (url.hostname.includes('firebaseio.com') || 
      url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('google.com')) {
    return;
  }

  // Stale-While-Revalidate Strategy للملفات الثابتة
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // جلب البيانات من الشبكة في الخلفية لتحديث الكاش للزيارة القادمة
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (url.origin === location.origin) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        console.warn('Network fetch failed for', event.request.url);
      });

      // إرجاع النسخة المخبأة فوراً لسرعة صاروخية، أو الانتظار إذا لم تكن موجودة
      return cachedResponse || fetchPromise;
    })
  );
});
"""

with open("sw.js", "w", encoding="utf-8") as f:
    f.write(sw_content)
print("Updated sw.js")

# 3. Add loading spinner to ui.js
with open("ui.js", "r", encoding="utf-8") as f:
    ui_content = f.read()

loading_code = """
// =============================================
// حالة التحميل (Loading Spinner)
// =============================================
window.showLoadingState = function() {
    if (isDataLoadedFromFirestore) return;
    const spinnerHtml = '<div class="spinner-container" style="text-align:center; padding: 50px 0; grid-column: 1/-1; width: 100%;"><i class="fas fa-spinner fa-spin fa-3x" style="color: var(--green-accent);"></i><p style="margin-top:15px; color:var(--text-secondary); font-weight: bold;">جاري جلب البيانات بأقصى سرعة...</p></div>';
    
    const containers = ['vip-container', 'smart-container', 'iptv-container', 'plans-container'];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.innerHTML.trim() === '') {
            el.innerHTML = spinnerHtml;
        }
    });
};
document.addEventListener("DOMContentLoaded", showLoadingState);
"""

if "window.showLoadingState" not in ui_content:
    ui_content += loading_code
    with open("ui.js", "w", encoding="utf-8") as f:
        f.write(ui_content)
    print("Updated ui.js with loading state")
