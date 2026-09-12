@echo off
chcp 65001 > nul
echo ========================================================
echo    سيرفرات الميزو - بناء تطبيق ويندوز للكمبيوتر (EXE)
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
echo [2/3] جاري بناء ملفات EXE للويندوز (المثبت + المحمول)...
call npm run electron:build
if %ERRORLEVEL% NEQ 0 (
    echo [خطأ] فشل في بناء تطبيق الويندوز!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================================
echo   تم البناء بنجاح! ستجد ملفات EXE داخل مجلد dist-electron
echo ========================================================
explorer dist-electron
pause
