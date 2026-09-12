const fs = require('fs'); 
const files = ['vip.html', 'vip-details.html', 'smart.html', 'server-details.html', 'iptv.html', 'index.html', 'devices.html', 'app-details.html']; 
files.forEach(f => { 
    if (!fs.existsSync(f)) return;
    let c = fs.readFileSync(f, 'utf8'); 
    c = c.replace(/style="visibility: hidden;"/g, ''); 
    c = c.replace(/class="header-login-btn"/g, 'class="header-login-btn auth-loading"'); 
    c = c.replace(/<a([^>]+)target="_blank"([^>]*)>/g, (match, p1, p2) => { 
        if (!match.includes('rel=')) return `<a${p1}target="_blank" rel="noopener"${p2}>`; 
        return match; 
    }); 
    fs.writeFileSync(f, c); 
});
