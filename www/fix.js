const fs = require('fs');
const path = 'd:/My File/ALmEz0/1- Site/security-monitor.js';
let lines = fs.readFileSync(path, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('async function autoCleanupOldLogs() {')) {
        // Check if the previous line is `    }`
        if (!lines[i-1].includes('    }')) {
            lines.splice(i, 0, '    }');
            fs.writeFileSync(path, lines.join('\n'), 'utf8');
            console.log('Inserted missing brace');
            break;
        }
    }
}
