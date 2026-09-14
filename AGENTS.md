# Mandatory Instructions for All AI Agents (Cursor, Claude, Gemini, Antigravity, Copilot, etc.)

> **CRITICAL RULE**: Whenever you make ANY code change, bug fix, or feature update in this repository, you MUST follow this mandatory workflow before finishing your response:

## 1. Mandatory Version Bump
You MUST increment the version number in ALL 4 files simultaneously:
1. `version.json`:
   - Increment `"version"` (e.g. `1.0.1` -> `1.0.2`)
   - Increment `"versionCode"` (e.g. `2` -> `3`)
   - Update `"releaseDate"` to today's date
   - Update `"title"` and `"notes"`
2. `package.json`:
   - Update `"version": "1.0.2"`
3. `app-bridge.js`:
   - Update `const CURRENT_APP_VERSION = '1.0.2';`
4. `android/app/build.gradle`:
   - Increment `versionCode 3`
   - Increment `versionName "1.0.2"`

## 2. Mandatory Automatic Git Push
You MUST automatically commit and push the changes to GitHub without waiting for the user to ask:
```bash
git add .
git commit -m "Auto-bump to vX.X.X: <summary of changes>"
git push origin main
```

## Why this is required:
GitHub Actions builds the Android APK and Windows EXE automatically on push to `main` and deploys them to GitHub Releases. The apps check `version.json` for updates. If the version is not bumped and pushed, installed client applications will never be updated.
