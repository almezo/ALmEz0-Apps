const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.resolve(rootDir, 'dist-hosting');

console.log('📦 Starting clean web hosting export...');

// 1. Clean output directory
if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

// 2. Copy photo folder
function copyDir(src, dest) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

copyDir(path.join(rootDir, 'photo'), path.join(outDir, 'photo'));

// 3. Allowed file extensions for web hosting
const allowedExtensions = ['.html', '.css', '.js', '.json', '.ico', '.png', '.jpg', '.jpeg', '.svg', '.php'];
const allowedSpecialFiles = ['.htaccess', 'php.ini'];

const excludedFileNames = [
    'package.json',
    'package-lock.json',
    'firebase.json',
    'firestore.indexes.json',
    'capacitor.config.json',
    'firestore.rules'
];

let copiedCount = 0;
const rootFiles = fs.readdirSync(rootDir, { withFileTypes: true });
for (const file of rootFiles) {
    if (file.isFile()) {
        const ext = path.extname(file.name).toLowerCase();
        if (
            (allowedExtensions.includes(ext) || allowedSpecialFiles.includes(file.name)) &&
            !excludedFileNames.includes(file.name) &&
            !file.name.endsWith('.py') &&
            !file.name.endsWith('.gs') &&
            !file.name.endsWith('.bat') &&
            !file.name.startsWith('fix') &&
            !file.name.startsWith('scratch') &&
            !file.name.startsWith('patch') &&
            !file.name.startsWith('find_') &&
            !file.name.startsWith('add_')
        ) {
            fs.copyFileSync(path.join(rootDir, file.name), path.join(outDir, file.name));
            copiedCount++;
        }
    }
}

console.log(`📁 Copied ${copiedCount} essential web files + photo directory to dist-hosting/`);

// 4. Create ALmEz0-Website.zip directly for 1-click upload
const zipPath = path.join(rootDir, 'ALmEz0-Website.zip');
if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
}

try {
    console.log('🗜️ Compressing clean files into ALmEz0-Website.zip...');
    execSync(`powershell -Command "Compress-Archive -Path '${outDir}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'inherit' });
    const stats = fs.statSync(zipPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`✅ Ready! ALmEz0-Website.zip created successfully (${sizeMB} MB)!`);
} catch (e) {
    console.warn('⚠️ Could not compress archive automatically:', e.message);
}
