const fs = require("fs");
const path = require("path");

const p = path.join(__dirname, "..", "staff.js");
let s = fs.readFileSync(p, "utf8");

// 1. Remove the duplicated top part.
// Find the SECOND "// =============================================" block for Staff Sales Dashboard.
const magicString = "// =============================================\r\n// ???? ???? ???????? ???????? (Staff Sales Dashboard)\r\n// =============================================";
let lastIndex = s.lastIndexOf(magicString);
if (lastIndex > 0) {
    s = s.substring(lastIndex);
}

// 2. Now we have a clean file. Let us replace the processBalances function.
// We will replace the entire processBalances function with a robust version that handles daily stats AND reads required balances from staffData.
const pbStart = s.indexOf("function processBalances() {");
const pbEnd = s.indexOf("// ???????? ???? ??????? ???????", pbStart);

const newPB = `function processBalances() {
            let todayLibyanaSales = 0, todayLibyanaWithdrawals = 0;
            let todayAlmadarSales = 0, todayAlmadarWithdrawals = 0;
            let todayCashSales = 0, todayCashWithdrawals = 0;
            let todayTotalProfit = 0;
            let cumulativeDebtCredit = 0;
            let cumulativeDebtCash = 0;
            
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            
            // 1. ???? ???????? ????? ??????? ?? Taker
            if (myDocs) {
                myDocs.forEach(doc => {
                    const data = doc.data();
                    const isToday = !data.timestamp || (data.timestamp.toDate().getTime() >= startOfDay);
                    
                    if (data.type === "sale") {
                        const price = parseFloat(data.price) || 0;
                        if (data.method === "???????" && isToday) todayLibyanaSales += price;
                        if (data.method === "??????" && isToday) todayAlmadarSales += price;
                        if ((data.method === "???" || data.method === "???") && isToday) todayCashSales += price;
                        
                        if (isToday) {
                            let pool = 0;
                            if (data.points !== undefined && data.points !== null) {
                                pool = Number(data.points) || 0;
                            } else {
                                pool = calculateTotalCommission(data.product, data.duration);
                            }
                            todayTotalProfit += pool;
                        }
                    } else if (data.type === "withdrawal") {
                        const amt = parseFloat(data.amount) || 0;
                        if (data.wallet === "???????" && isToday) todayLibyanaWithdrawals += amt;
                        if (data.wallet === "??????" && isToday) todayAlmadarWithdrawals += amt;
                        if (data.wallet === "???" && isToday) todayCashWithdrawals += amt;
                    } else if (data.type === "debt_transfer") {
                        const amtCash = parseFloat(data.amount) || 0;
                        const amtCredit = parseFloat(data.originalCredit) || 0;
                        cumulativeDebtCredit += amtCredit;
                        cumulativeDebtCash += amtCash;
                    }
                });
            }

            // ????? ??????? ???????? ??????? ?? ??????! (?????? ???????)
            const libyanaTotal = parseFloat(staffData.currentLibyana) || 0;
            const almadarTotal = parseFloat(staffData.currentAlmadar) || 0;
            const cashTotal = parseFloat(staffData.currentCash) || 0;
            const netProfit = parseFloat(staffData.currentNetProfit) || 0;
            
            if (document.getElementById("libyanaBalance")) document.getElementById("libyanaBalance").innerHTML = \`<span dir="ltr" style="display: inline-block;">\${libyanaTotal.toFixed(2)}</span> <span style="font-size: 0.7rem;">?.?</span>\`;
            if (document.getElementById("almadarBalance")) document.getElementById("almadarBalance").innerHTML = \`<span dir="ltr" style="display: inline-block;">\${almadarTotal.toFixed(2)}</span> <span style="font-size: 0.7rem;">?.?</span>\`;
            if (document.getElementById("cashBalance")) document.getElementById("cashBalance").innerHTML = \`<span dir="ltr" style="display: inline-block;">\${cashTotal.toFixed(2)}</span> <span style="font-size: 0.7rem;">?.?</span>\`;
            
            const profitEl = document.querySelector("#profitBalance .card-profit-amount");
            if (profitEl) {
                profitEl.textContent = netProfit.toFixed(2);
            }
            
            if (document.getElementById("staffTodayProfit")) {
                document.getElementById("staffTodayProfit").innerHTML = \`\${todayTotalProfit.toFixed(2)} <span style="font-size: 1rem;">?.?</span>\`;
            }
            
            if (document.getElementById("cumulativeDebtCredit")) {
                document.getElementById("cumulativeDebtCredit").innerHTML = \`\${cumulativeDebtCredit.toFixed(2)} <span style="font-size: 1rem;">?.?</span>\`;
            }
            if (document.getElementById("cumulativeDebtCash")) {
                document.getElementById("cumulativeDebtCash").innerHTML = \`\${cumulativeDebtCash.toFixed(2)} <span style="font-size: 1rem;">?.?</span>\`;
            }
        }

        `;

s = s.substring(0, pbStart) + newPB + s.substring(pbEnd);
fs.writeFileSync(p, s);
console.log("Done");

