# Mandatory Instructions for All AI Agents (Cursor, Claude, Gemini, Antigravity, Copilot, etc.)

> **CRITICAL RULE**: Whenever you make ANY code change, bug fix, or feature update in this repository, you MUST follow this mandatory workflow before finishing your response:

## 1. Mandatory Version Bump
You MUST increment the version number in ALL 4 files simultaneously:
1. `version.json`:
   - Increment `"version"` (e.g. `1.0.6` -> `1.0.7`)
   - Increment `"versionCode"` (e.g. `7` -> `8`)
   - Update `"releaseDate"` to today's date
   - Update `"title"` and `"notes"`
   - **CRITICAL - `minSupportedVersion` Rule (Preventing Client Update Fatigue)**:
     - **For Minor / Web / Admin / Staff Updates** (تعديلات الموقع، لوحة الإدارة، المناديب، التصميم، التقارير):
       **DO NOT** bump `minSupportedVersion`. Keep it at its existing value (e.g. `"1.0.0"`). This ensures installed client apps (Android & Windows) receive the update optionally and can click "المتابعة والتحديث لاحقاً" without being locked out.
     - **For Major / Breaking / Core Player Updates** (تحديث جوهري في كود البث، مشغل الفيديو، أو تغيير إلزامي في السيرفرات):
       Set `"minSupportedVersion"` equal to the new `"version"` (e.g. `"1.0.7"`). This forces installed client apps to install the mandatory update.

2. `package.json`:
   - Update `"version": "1.0.7"`

3. `app-bridge.js`:
   - Update `const CURRENT_APP_VERSION = '1.0.7';`

4. `android/app/build.gradle`:
   - Increment `versionCode 8`
   - Increment `versionName "1.0.7"`

## 2. Mandatory Web & Capacitor Asset Sync
Whenever changes are made to frontend files (`.html`, `.css`, `.js`, etc.), you MUST sync assets before committing:
```bash
npm run prepare:app
npx cap sync android
```

## 3. Mandatory Automatic Git Push
You MUST automatically commit and push the changes to GitHub without waiting for the user to ask:
```bash
git add .
git commit -m "Auto-bump to vX.X.X: <summary of changes>"
git push origin main
```
*(Note: In Windows PowerShell, use `;` to chain commands instead of `&&`)*

## Why this is required:
GitHub Actions builds the Android APK and Windows EXE automatically on push to `main` and deploys them to GitHub Releases. The apps check `version.json` for updates. If the version is not bumped and pushed, installed client applications will never be updated.
