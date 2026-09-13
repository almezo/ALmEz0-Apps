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

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>لا يوجد اتصال بالإنترنت | سيرفرات الميزو</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        body {
            background-color: #0a0d12;
            background-image: radial-gradient(circle at 50% 20%, #171d27 0%, #0a0d12 80%);
            color: #ffffff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            direction: rtl;
            text-align: center;
        }
        .offline-box {
            background: linear-gradient(145deg, #141922, #0e1218);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 28px;
            padding: 44px 32px;
            max-width: 440px;
            width: 100%;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .offline-icon-circle {
            width: 88px;
            height: 88px;
            border-radius: 50%;
            background: rgba(239, 68, 68, 0.12);
            border: 2px solid rgba(239, 68, 68, 0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 24px;
            color: #ef4444;
            animation: pulseGlow 2.5s infinite ease-in-out;
        }
        @keyframes pulseGlow {
            0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.3); }
            50% { transform: scale(1.05); box-shadow: 0 0 25px rgba(239, 68, 68, 0.45); }
        }
        .offline-icon-circle svg {
            width: 42px;
            height: 42px;
            fill: none;
            stroke: currentColor;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .offline-title {
            font-size: 22px;
            font-weight: 800;
            color: #ffffff;
            margin-bottom: 12px;
            letter-spacing: -0.3px;
        }
        .offline-desc {
            font-size: 14.5px;
            color: #9da0a6;
            line-height: 1.8;
            margin-bottom: 30px;
        }
        .offline-btn {
            background: linear-gradient(135deg, #22c55e, #16a34a);
            color: #ffffff;
            border: none;
            padding: 13px 36px;
            border-radius: 14px;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            transition: all 0.25s ease;
            box-shadow: 0 10px 25px rgba(34, 197, 94, 0.35);
            text-decoration: none;
        }
        .offline-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 14px 30px rgba(34, 197, 94, 0.5);
        }
        .offline-btn svg {
            width: 18px;
            height: 18px;
            fill: none;
            stroke: currentColor;
            stroke-width: 2.2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .offline-footer {
            margin-top: 26px;
            font-size: 12px;
            color: #555b66;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="offline-box">
        <div class="offline-icon-circle">
            <svg viewBox="0 0 24 24"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>
        </div>
        <h1 class="offline-title">لا يوجد اتصال بالإنترنت</h1>
        <p class="offline-desc">
            يبدو أن جهازك غير متصل بالإنترنت حالياً. يرجى التحقق من اتصال شبكة Wi-Fi أو بيانات الهاتف والمحاولة مرة أخرى.
        </p>
        <button class="offline-btn" onclick="window.location.reload()">
            <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            <span>إعادة المحاولة</span>
        </button>
        <div class="offline-footer">سيرفرات الميزو - ALmEz0</div>
    </div>
</body>
</html>`;

    // باقي الطلبات العادية (HTML, CSS, JS, صور)
    event.respondWith(
        fetch(event.request).catch(() => {
            const isNavigate = event.request.mode === 'navigate' || event.request.destination === 'document';
            if (isNavigate) {
                return new Response(OFFLINE_HTML, {
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                });
            }
            return new Response('Network error occurred.', { status: 408, statusText: 'Offline' });
        })
    );
});
