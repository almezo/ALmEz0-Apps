# Mandatory Version Bump & Auto-Git-Push Rule

Whenever any AI model (Antigravity, Claude, Gemini, GPT, Cursor, Copilot, etc.) makes ANY code or content modification in this repository, the model MUST strictly and automatically perform the following steps without waiting for the user to ask:

## 1. Increment Version Number (Version Bump)
Increment the patch version (e.g., `1.0.1` -> `1.0.2`, `1.0.2` -> `1.0.3`) and the numeric version code across ALL of the following 4 files simultaneously:

1. **`version.json`**:
   - Increment `"version"` (e.g., `"1.0.2"`)
   - Increment `"versionCode"` (e.g., `3`)
   - Update `"releaseDate"` to current date (YYYY-MM-DD)
   - Update `"title"` and `"notes"` describing the change

2. **`package.json`**:
   - Increment `"version"` (e.g., `"1.0.2"`)

3. **`app-bridge.js`**:
   - Update `const CURRENT_APP_VERSION = '1.0.2';`

4. **`android/app/build.gradle`**:
   - Increment `versionCode` (e.g., `3`)
   - Increment `versionName` (e.g., `"1.0.2"`)

## 2. Automatic Git Commit & Push
Immediately after applying the code changes and bumping the version files, the AI MUST execute:
```bash
git add .
git commit -m "Auto-bump to vX.X.X: <brief summary of changes>"
git push origin main
```
*(or the active branch if main is not active)*

### Why this is strictly mandatory:
- GitHub Actions automatically listens to pushes on `main`/`master` to compile the native Android APK (`ALmEz0.apk`) and Windows executable (`ALmEz0.exe`) and publish them to the GitHub Releases repository (`almezo/ALmEz0-Downloads`).
- The in-app update detector (`checkInAppUpdate`) compares the installed version on client devices against `version.json`. If the version number is not incremented and pushed, existing users with installed applications will NEVER receive the update banner or new downloads.
