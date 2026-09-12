import os
import re

print("Starting migration...")

# 1. Migrate index.html -> player.html
with open('IPTV-m3u-Web-Player-ez-main/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('lang="en"', 'lang="ar" dir="rtl"')
html = html.replace('<title>IPTV Video Player</title>', '<title>مشغل سيرفرات الميزو - ALmEz0</title>')
html = html.replace('<h1>🎬 IPTV Video Player</h1>', '<h1>🎬 مشغل سيرفرات الميزو</h1>')
html = html.replace('style.css', 'style-player.css')

firebase_scripts = """
  <!-- Firebase SDK -->
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
  <script src="firebase-config.js?v=4042.0"></script>
"""
html = html.replace('<link rel="stylesheet" href="style-player.css">', '<link rel="stylesheet" href="style-player.css">\n' + firebase_scripts)

# Translate UI
html = html.replace('Welcome to IPTV Player', 'مرحباً بك في مشغل الميزو')
html = html.replace('Choose your connection method', 'أدخل بيانات اشتراكك')
html = html.replace('Host/Server URL', 'كود السيرفر (Server Code)')
html = html.replace('<input type="text" id="hostInput" placeholder="http://example.com:8080" required>', '<input type="text" id="serverCodeInput" placeholder="أدخل كود السيرفر (مثال: 001)" required>')
html = html.replace('Test Connection & Login', 'دخول')

# Hide M3U tabs
html = html.replace('<button class="method-btn" data-method="file">', '<button class="method-btn" data-method="file" style="display:none">')
html = html.replace('<button class="method-btn" data-method="url">', '<button class="method-btn" data-method="url" style="display:none">')

with open('player.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("player.html created successfully.")

# 2. Migrate style.css -> style-player.css
with open('IPTV-m3u-Web-Player-ez-main/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Add RTL basic fixes
css += """
/* RTL and ALmEz0 Branding Overrides */
body {
    background: linear-gradient(135deg, #0a0d12 0%, #141820 100%);
    font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
}
.header-controls {
    flex-direction: row-reverse;
}
.btn-connect {
    background: linear-gradient(135deg, #02b875 0%, #177c56 100%);
}
.login-container {
    background: rgba(20, 24, 32, 0.85);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.05);
}
"""
with open('style-player.css', 'w', encoding='utf-8') as f:
    f.write(css)
print("style-player.css created successfully.")

# 3. Migrate core.js
with open('IPTV-m3u-Web-Player-ez-main/core.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Proxy and Failover Injection
failover_logic = """
const PROXY_URL = 'http://localhost:8000/proxy.php'; // Change to proxy.php in production

// --- ALMEZ0 FIREBASE FAILOVER LOGIC ---
async function fetchHostsFromServerCode(serverCode) {
    showStatus(connectionStatus, "جاري البحث عن السيرفر...", "info");
    const docRef = db.collection('server_hosts').doc(serverCode);
    const doc = await docRef.get();
    
    if (!doc.exists) {
        throw new Error('كود السيرفر غير صحيح');
    }
    
    const data = doc.data();
    const urls = [];
    for (let key in data) {
        if (key.startsWith('host_url_')) {
            urls.push({ key: key, url: data[key] });
        }
    }
    urls.sort((a, b) => a.key.localeCompare(b.key));
    const sortedUrls = urls.map(item => item.url);
    if (sortedUrls.length === 0) {
        throw new Error('لا توجد خوادم متاحة لهذا الكود');
    }
    return sortedUrls;
}

// --- OVERRIDE CONNECT BTN ---
"""

js = js.replace('const hostInput = document.getElementById("hostInput");', 'const serverCodeInput = document.getElementById("serverCodeInput");')

old_listener = """connectBtn.addEventListener("click", async function() {
  const host = hostInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  
  if (!host || !username || !password) {
    showStatus(connectionStatus, "Please fill in all fields", "error");
    return;
  }
  
  const config = await testXtreamConnection(host, username, password);
  
  if (config) {
    currentXtreamConfig = config;
    
    if (rememberMe.checked) {
      saveCredentialsToCookie(host, username, password);
    }
    
    const success = await loadXtreamChannels(config);
    if (success) {
      await loadXtreamMovies(config);
      setTimeout(function() {
        showMainApp(true);
      }, 500);
    }
  }
});"""

new_listener = failover_logic + """
connectBtn.addEventListener("click", async function() {
  const serverCode = serverCodeInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  
  if (!serverCode || !username || !password) {
    showStatus(connectionStatus, "الرجاء تعبئة كافة الحقول", "error");
    return;
  }
  
  showSpinner(true);
  try {
      const sortedUrls = await fetchHostsFromServerCode(serverCode);
      
      async function tryHost(index) {
          if (index >= sortedUrls.length) {
              showStatus(connectionStatus, "عذراً، جميع خوادم هذا السيرفر لا تستجيب حالياً", "error");
              showSpinner(false);
              return;
          }
          const currentHost = sortedUrls[index];
          showStatus(connectionStatus, `جاري الاتصال بالخادم ${index + 1}...`, "info");
          
          const config = await testXtreamConnection(currentHost, username, password);
          if (config) {
              currentXtreamConfig = config;
              if (rememberMe.checked) {
                  saveCredentialsToCookie(serverCode, username, password);
              }
              const success = await loadXtreamChannels(config);
              if (success) {
                  await loadXtreamMovies(config);
                  setTimeout(function() {
                      showMainApp(true);
                  }, 500);
              }
          } else {
              tryHost(index + 1);
          }
      }
      
      tryHost(0);
      
  } catch (error) {
      console.error(error);
      showStatus(connectionStatus, error.message, "error");
      showSpinner(false);
  }
});
"""

if old_listener in js:
    js = js.replace(old_listener, new_listener)
else:
    js = re.sub(r'connectBtn\.addEventListener\("click", async function\(\) \{[\s\S]+?\}\);', new_listener, js, count=1)


old_test_fetch = """const apiUrl = normalizedHost + "/player_api.php?username=" + username + "&password=" + password;
    
    const response = await fetch(apiUrl);"""

new_test_fetch = """const apiUrl = normalizedHost + "/player_api.php?username=" + username + "&password=" + password;
    const proxyFetchUrl = PROXY_URL + '?target=' + encodeURIComponent(apiUrl);
    const response = await fetch(proxyFetchUrl);"""
js = js.replace(old_test_fetch, new_test_fetch)


old_ch_fetch = """const apiUrl = config.host + "/player_api.php?username=" + config.username + "&password=" + config.password + "&action=get_live_streams";
    
    const response = await fetch(apiUrl);"""
new_ch_fetch = """const apiUrl = config.host + "/player_api.php?username=" + config.username + "&password=" + config.password + "&action=get_live_streams";
    const proxyFetchUrl = PROXY_URL + '?target=' + encodeURIComponent(apiUrl);
    const response = await fetch(proxyFetchUrl);"""
js = js.replace(old_ch_fetch, new_ch_fetch)


old_mv_fetch = """const apiUrl = config.host + "/player_api.php?username=" + config.username + "&password=" + config.password + "&action=get_vod_streams";
    
    const response = await fetch(apiUrl);"""
new_mv_fetch = """const apiUrl = config.host + "/player_api.php?username=" + config.username + "&password=" + config.password + "&action=get_vod_streams";
    const proxyFetchUrl = PROXY_URL + '?target=' + encodeURIComponent(apiUrl);
    const response = await fetch(proxyFetchUrl);"""
js = js.replace(old_mv_fetch, new_mv_fetch)


old_play_hls = """new Hls({
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 60,
        enableWorker: true,
        subtitleDisplay: true
      });"""
new_play_hls = """new Hls({
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 60,
        enableWorker: true,
        subtitleDisplay: true,
        xhrSetup: function(xhr, url) {
            xhr.open('GET', PROXY_URL + '?target=' + encodeURIComponent(url), true);
        }
      });"""
js = js.replace(old_play_hls, new_play_hls)

js = re.sub(r'video\.src\s*=\s*(channelUrl|movieUrl);', r"video.src = PROXY_URL + '?target=' + encodeURIComponent(\1);", js)

with open('core.js', 'w', encoding='utf-8') as f:
    f.write(js)
print("core.js created successfully.")

print("Migration completed.")
