<?php
// =====================================================================
// سكربت النسخ الاحتياطي لملفات الموقع - سيرفرات الميزو (ALmEz0)
// يُستدعى تلقائياً كل ساعة عبر Cron Job في cPanel
// يضغط كل ملفات الموقع ويرسلها إلى Google Apps Script ليحفظها في Drive
// =====================================================================

// ---------- الإعدادات (لازم تعبيها) ----------
$siteDir   = __DIR__; // مجلد الموقع بالكامل (ضع هذا الملف في نفس مجلد الموقع الرئيسي)
$webAppUrl = 'https://script.google.com/macros/s/AKfycbxB6bnyFGe1aSCjAgRO211gO1n4v93kfaE1nDXOLR0V9_dY3_pYqYIN0JjBO2z8E9G3nA/exec; // ينتهي بـ /exec
$secret    = 'AlmezoSecret2026SafeKey!';

// مجلدات/ملفات لا داعي لتضمينها في النسخة الاحتياطية
$excludePatterns = ['backup-cron.php', 'backup-log.txt', '.git', 'node_modules'];

// ---------- 1. ضغط ملفات الموقع بالكامل ----------
$zipFile = sys_get_temp_dir() . '/site-backup-' . date('Y-m-d_H') . '.zip';

$zip = new ZipArchive();
if ($zip->open($zipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== TRUE) {
    file_put_contents(__DIR__ . '/backup-log.txt', date('Y-m-d H:i:s') . " - فشل إنشاء ملف ZIP\n", FILE_APPEND);
    exit(1);
}

$files = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($siteDir, FilesystemIterator::SKIP_DOTS)
);

foreach ($files as $file) {
    $realPath = $file->getRealPath();
    $skip = false;
    foreach ($excludePatterns as $pattern) {
        if (strpos($realPath, $pattern) !== false) { $skip = true; break; }
    }
    if ($skip) continue;

    $relativePath = substr($realPath, strlen($siteDir) + 1);
    $zip->addFile($realPath, $relativePath);
}
$zip->close();

// ---------- 2. رفع الملف المضغوط إلى Google Drive عبر Apps Script ----------
$ch = curl_init($webAppUrl);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true); // Apps Script يعمل Redirect عند الرفع
curl_setopt($ch, CURLOPT_POSTFIELDS, [
    'secret' => $secret,
    'file'   => new CURLFile($zipFile, 'application/zip', 'site-files.zip')
]);
curl_setopt($ch, CURLOPT_TIMEOUT, 300);
$result = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// ---------- 3. تسجيل نتيجة العملية وتنظيف الملف المؤقت ----------
@unlink($zipFile);
file_put_contents(
    __DIR__ . '/backup-log.txt',
    date('Y-m-d H:i:s') . " - HTTP $httpCode - الرد: $result\n",
    FILE_APPEND
);
