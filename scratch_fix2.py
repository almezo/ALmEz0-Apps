import os
import glob
import re

html_files = glob.glob("*.html")

for file in html_files:
    with open(file, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Remove data.js inclusion
    new_content = re.sub(r'<script\s+src=["\']data\.js["\']\s*></script>\s*', '', content)
    
    # Also add cache-busting dynamic versioning to ui.js and style.css in the HTML? 
    # Not necessary if we fix sw.js and rely on Network First properly, but it helps.
    
    if content != new_content:
        with open(file, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Removed data.js from {file}")

# Fix ui.js to declare siteData
with open("ui.js", "r", encoding="utf-8") as f:
    ui_content = f.read()

var_decl = "let siteData = { iptv: [], smartApps: [], vip: [] };\n"
if "let siteData" not in ui_content:
    # Insert it under // === متغيرات عامة ===
    ui_content = ui_content.replace("// === متغيرات عامة ===", "// === متغيرات عامة ===\n" + var_decl)

# Remove the migration block for empty snapshot
old_snapshot_check = """        // إذا كانت القاعدة فارغة (لم يتم الترحيل بعد)، لا تقم بمسح siteData الأصلية لتسمح بالترحيل
        if (snapshot.empty && !isDataLoadedFromFirestore) {
            console.log("قاعدة البيانات فارغة، سيتم الاحتفاظ ببيانات data.js مؤقتاً للترحيل.");
            return;
        }"""
ui_content = ui_content.replace(old_snapshot_check, "")

with open("ui.js", "w", encoding="utf-8") as f:
    f.write(ui_content)

print("Updated ui.js")

# Fix sw.js for strict Network First and Cache Busting
sw_content = """// =============================================
// Service Worker for AlMeZ0 Servers PWA (Network First Strict)
// =============================================

const CACHE_NAME = 'almez0-pwa-v6-' + new Date().getTime(); // Always bust old cache on load

// مرحلة التفعيل (Activate)
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

// استرجاع الطلبات (Fetch)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  // Strict Network First strategy
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // إذا نجح الاتصال، نقوم بحفظ النسخة الجديدة في الكاش
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() => {
        // في حال انقطاع الإنترنت، نسترجع من الكاش
        return caches.match(event.request);
      })
  );
});
"""

with open("sw.js", "w", encoding="utf-8") as f:
    f.write(sw_content)

print("Updated sw.js")

# Finally, let's delete data.js since it's no longer needed
if os.path.exists("data.js"):
    os.remove("data.js")
    print("Deleted data.js")

