const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.resolve(rootDir, 'www');

// Clean or create www
if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

// Copy directory recursively
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

// 1. Copy photo folder
copyDir(path.join(rootDir, 'photo'), path.join(outDir, 'photo'));

// 2. Allowed root files
const allowedExtensions = ['.html', '.css', '.js', '.json', '.ico', '.png', '.jpg', '.jpeg', '.svg'];
const excludedFileNames = [
    'package.json',
    'package-lock.json',
    'firebase.json',
    'firestore.indexes.json',
    'capacitor.config.json'
];

const rootFiles = fs.readdirSync(rootDir, { withFileTypes: true });
for (const file of rootFiles) {
    if (file.isFile()) {
        const ext = path.extname(file.name).toLowerCase();
        // Ignore python scripts, php scripts, dotfiles, lockfiles, etc.
        if (
            allowedExtensions.includes(ext) &&
            !excludedFileNames.includes(file.name) &&
            !file.name.endsWith('.py') &&
            !file.name.endsWith('.php') &&
            !file.name.endsWith('.gs')
        ) {
            fs.copyFileSync(path.join(rootDir, file.name), path.join(outDir, file.name));
        }
    }
}

console.log('✅ Prepared clean web assets in www/ directory successfully!');
