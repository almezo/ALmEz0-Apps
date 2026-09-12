@echo off
chcp 65001 > nul
echo ========================================================
echo    سيرفرات الميزو - بناء تطبيق أندرويد (APK)
echo ========================================================
echo.

echo [1/3] تجهيز ملفات واجهة الموقع...
call npm run prepare:app
if %ERRORLEVEL% NEQ 0 (
    echo [خطأ] فشل في تجهيز ملفات الموقع!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] مزامنة ملفات أندرويد عبر Capacitor...
call npx cap sync android
if %ERRORLEVEL% NEQ 0 (
    echo [خطأ] فشل في مزامنة تطبيق أندرويد!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/3] التحقق من أدوات بناء الأندرويد المحلية...
where gradle >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo جاري بناء ملف الـ APK عبر Gradle...
    cd android
    call gradlew assembleDebug
    cd ..
    echo.
    echo تم البناء بنجاح!
    explorer android\app\build\outputs\apk\debug
) else (
    echo.
    echo تنبيه: لم يتم العثور على Java / Gradle على جهازك للبناء المباشر.
    echo يمكنك إما:
    echo 1. فتح المشروع في Android Studio عبر الأمر: npx cap open android
    echo 2. أو رفع المشروع إلى GitHub ليقوم الـ GitHub Actions ببناء ملف الـ APK السحابي وتنزيله بضغطة زر!
)

pause
