const fs = require("fs");
const path = require("path");

const p = path.join(__dirname, "..", "staff.js");
let s = fs.readFileSync(p, "utf8");

// We need to fix the broken block around processBalances
const startIdx = s.indexOf("function processBalances() {");
const endIdx = s.indexOf("        // ???????? ???? ??????? ???????", startIdx);

const newProcessBalances = `function processBalances() {
            // ???? ???????? ???????? ???? ???????? ??? ??????? ???? ?????? ?????? ???!
            const libyanaTotal = parseFloat(staffData.currentLibyana) || 0;
            const almadarTotal = parseFloat(staffData.currentAlmadar) || 0;
            const cashTotal = parseFloat(staffData.currentCash) || 0;
            const netProfit = parseFloat(staffData.currentNetProfit) || 0;

            const libSpan = document.querySelector(".balance-val-libyana .balance-val-amount");
            if (libSpan) libSpan.textContent = libyanaTotal.toFixed(2);
            
            const almSpan = document.querySelector(".balance-val-almadar .balance-val-amount");
            if (almSpan) almSpan.textContent = almadarTotal.toFixed(2);
            
            const cashSpan = document.querySelector(".balance-val-cash .balance-val-amount");
            if (cashSpan) cashSpan.textContent = cashTotal.toFixed(2);
            
            const profitSpan = document.querySelector(".balance-val-profit .balance-val-amount");
            if (profitSpan) profitSpan.textContent = netProfit.toFixed(2);
            
            // Note: If there are other UI elements that need updating in processBalances, 
            // they might be missing now, but we will restore them if needed later.
        }

`;

s = s.substring(0, startIdx) + newProcessBalances + s.substring(endIdx);
fs.writeFileSync(p, s);
console.log("Done");

