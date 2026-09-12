<?php
// =============================================
// صفحة وسيطة لفتح مشغل الميزو بـ HTTP
// تعمل Server-Side Redirect (302) لتجاوز
// ترقية المتصفح التلقائية من HTTP إلى HTTPS
// =============================================
header("Location: http://player.almezo.store", true, 302);
header("Cache-Control: no-cache, no-store, must-revalidate");
exit();
?>
