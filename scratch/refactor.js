const fs = require('fs');
const path = require('path');

const staffJsPath = path.join(__dirname, '..', 'staff.js');
let staffJs = fs.readFileSync(staffJsPath, 'utf8');

// Replace processBalances entirely
const processBalancesRegex = /function processBalances\(\) \{[\s\S]*?\n        \}/;
staffJs = staffJs.replace(processBalancesRegex, \unction processBalances() {
            // ??????? ???????? ?? ????? ???????? ??? ??? ????????
            const libyanaTotal = parseFloat(staffData.currentLibyana) || 0;
            const almadarTotal = parseFloat(staffData.currentAlmadar) || 0;
            const cashTotal = parseFloat(staffData.currentCash) || 0;
            const netProfit = parseFloat(staffData.currentNetProfit) || 0;

            const libSpan = document.querySelector('.balance-val-libyana .balance-val-amount');
            if (libSpan) libSpan.textContent = libyanaTotal.toFixed(2);
            
            const almSpan = document.querySelector('.balance-val-almadar .balance-val-amount');
            if (almSpan) almSpan.textContent = almadarTotal.toFixed(2);
            
            const cashSpan = document.querySelector('.balance-val-cash .balance-val-amount');
            if (cashSpan) cashSpan.textContent = cashTotal.toFixed(2);
            
            const profitSpan = document.querySelector('.balance-val-profit .balance-val-amount');
            if (profitSpan) profitSpan.textContent = netProfit.toFixed(2);
        }\);

fs.writeFileSync(staffJsPath, staffJs);
console.log('staff.js modified');

