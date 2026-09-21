// =============================================
// ???? ???? ???????? ???????? (Staff Sales Dashboard)
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    const staffMainContent = document.getElementById('staffMainContent');

    // 1. حماية الصفحة والتحقق من الصلاحيات
    auth.onAuthStateChanged(async (firebaseUser) => {
        if (!firebaseUser) {
            // لم يسجل الدخول، إعادة توجيه
            window.location.replace('index.html');
            return;
        }

        // جلب بيانات المستخدم لمعرفة الـ role
        const profile = await fetchUserProfile(firebaseUser.uid);
        window.currentStaffProfile = profile;
        if (!profile || (profile.role !== 'staff' && profile.role !== 'admin')) {
            // ليس مندوباً أو مديراً، إعادة توجيه
            window.location.replace('index.html');
            return;
        }

        // إظهار المحتوى للمندوب/المدير
        staffMainContent.style.display = 'block';

        // بدء العمليات الأساسية للوحة
        fetchProducts();
        setupForms(firebaseUser.uid);
        setupImageExportListener();
        if (typeof window.listenToStaffInventory === 'function') window.listenToStaffInventory();

        const isAdmin = profile.role === 'admin';
        if (isAdmin) {
            setupAdminStaffSelector();
        } else {
            window.currentActiveStaffName = profile.name || 'مندوب';
            window.currentActiveStaffUid = firebaseUser.uid;
            setupBalancesListener(firebaseUser.uid, profile.name || 'مندوب');
            setupHistoryListener(firebaseUser.uid);
            updateSaleFormForStaff();
        }
    });

    // =============================================
    // دوال التحقق من المندوب ابراهيم وتحديث النموذج
    // =============================================
    function isCurrentStaffIbrahim() {
        const adminSelect = document.getElementById('adminStaffSelect');
        if (adminSelect && adminSelect.value) {
            const opt = adminSelect.options[adminSelect.selectedIndex];
            const optText = opt ? (opt.dataset.staffName || opt.textContent || '') : '';
            if (optText.includes('ابراهيم')) return true;
        }
        if (window.currentActiveStaffName && window.currentActiveStaffName.includes('ابراهيم')) {
            return true;
        }
        if (window.currentStaffProfile) {
            const pName = window.currentStaffProfile.name || window.currentStaffProfile.firstName || '';
            const pPhone = window.currentStaffProfile.phone || '';
            if (pName.includes('ابراهيم') || pPhone === '0923283083') return true;
        }
        return false;
    }

    function updateWithdrawalWalletOptions() {
        const walletSelect = document.getElementById('withdrawalWallet');
        if (!walletSelect) return;
        const isIbr = isCurrentStaffIbrahim();
        const currentVal = walletSelect.value;

        if (isIbr) {
            walletSelect.innerHTML = `
                <option value="" selected>اختر المحفظة...</option>
                <option value="ليبيانا">ليبيانا</option>
                <option value="المدار">المدار</option>
                <option value="كاش">كاش</option>
                <option value="حساب المصرفي">حساب المصرفي</option>
                <option value="سداد">سداد</option>
                <option value="USDT">USDT</option>
            `;
        } else {
            walletSelect.innerHTML = `
                <option value="" selected>اختر المحفظة...</option>
                <option value="ليبيانا">ليبيانا</option>
                <option value="المدار">المدار</option>
                <option value="كاش">كاش</option>
            `;
        }

        if (currentVal && Array.from(walletSelect.options).some(o => o.value === currentVal)) {
            walletSelect.value = currentVal;
        } else {
            walletSelect.selectedIndex = 0;
        }

        if (typeof window.updateWithdrawalFormLabels === 'function') {
            window.updateWithdrawalFormLabels();
        }
    }

    function updateSaleFormForStaff() {
        const isIbr = isCurrentStaffIbrahim();
        const pointsInput = document.getElementById('salePoints');
        if (pointsInput) {
            if (isIbr) {
                pointsInput.placeholder = 'عدد النقاط المسحوبة (اختياري لمندوب ابراهيم)';
            } else {
                pointsInput.placeholder = 'أدخل عدد النقاط المراد سحبها (مطلوب)';
            }
        }
        updateWithdrawalWalletOptions();
    }

    // =============================================
    // شريط اختيار المندوب للمدير فقط في لوحة المندوب
    // =============================================
    async function setupAdminStaffSelector() {
        const container = document.getElementById('adminStaffSelectorContainer');
        const select = document.getElementById('adminStaffSelect');
        if (container) container.style.display = 'flex';

        try {
            const snap = await db.collection('customers').where('role', '==', 'staff').get();
            if (select) {
                select.innerHTML = '';
                snap.docs.forEach(doc => {
                    const d = doc.data();
                    const name = d.firstName ? d.firstName.trim() : (d.name ? d.name.trim() : (d.phone || doc.id));
                    const opt = document.createElement('option');
                    opt.value = doc.id;
                    opt.textContent = name;
                    opt.dataset.staffName = name;
                    select.appendChild(opt);
                });

                select.addEventListener('change', () => {
                    const selectedOpt = select.options[select.selectedIndex];
                    if (selectedOpt && selectedOpt.value) {
                        const targetUid = selectedOpt.value;
                        const targetName = selectedOpt.dataset.staffName || selectedOpt.textContent;
                        window.currentActiveStaffName = targetName;
                        window.currentActiveStaffUid = targetUid;
                        setupBalancesListener(targetUid, targetName);
                        setupHistoryListener(targetUid);
                        updateSaleFormForStaff();
                    }
                });

                if (select.options.length > 0) {
                    select.selectedIndex = 0;
                    const firstOpt = select.options[0];
                    window.currentActiveStaffName = firstOpt.dataset.staffName || firstOpt.textContent;
                    window.currentActiveStaffUid = firstOpt.value;
                    setupBalancesListener(firstOpt.value, firstOpt.dataset.staffName || firstOpt.textContent);
                    setupHistoryListener(firstOpt.value);
                    updateSaleFormForStaff();
                }
            }
        } catch (e) {
            console.error('Error setting up admin staff selector:', e);
        }
    }

    // =============================================
    // 2. جلب المنتجات ديناميكياً لتعبئة قائمة "المنتج"
    // =============================================
    function fetchProducts() {
        db.collection('products').orderBy('sortOrder', 'asc').onSnapshot((snapshot) => {
            window.allProductsData = { iptv: [], smartApps: [], vip: [] };
            window.productsCategoryMap = {};

            snapshot.forEach(doc => {
                const data = doc.data();
                window.productsCategoryMap[data.name] = data.category;

                if (data.category === 'iptv' || data.category === 'smartApps' || data.category === 'vip') {
                    window.allProductsData[data.category].push({
                        name: data.name,
                        price: data.price
                    });
                }
            });

            // تحديث القوائم إذا كانت محددة مسبقاً
            const selectCategory = document.getElementById('saleProductCategory');
            if (selectCategory && selectCategory.value) {
                selectCategory.dispatchEvent(new Event('change'));
            }
        }, err => {
            console.error('Error fetching products:', err);
            if (typeof showToast === 'function') {
                showToast('حدث خطأ أثناء جلب المنتجات', 'error');
            }
        });
    }

    // =============================================
    // 3. حساب الأرصدة بشكل حي وإحصائيات اليوم والأرباح
    // =============================================

    // دالة حساب عمولة البيعة الواحدة (Total Commission)
    function calculateTotalCommission(productName, duration) {
        if (typeof window.calculateTotalCommission === 'function') {
            return window.calculateTotalCommission(productName, duration);
        }
        if (!productName || !duration) return 0;
        let cat = window.productsCategoryMap ? window.productsCategoryMap[productName] : null;

        if (!cat) {
            if (duration.includes('مدى') || duration.toLowerCase().includes('life')) cat = 'smart';
            else if (duration.includes('12') || duration.includes('سنة')) cat = 'iptv';
            else if (productName.toUpperCase().includes('VIP') || productName.includes('1') || productName.includes('2')) cat = 'vip';
            else cat = 'iptv';
        }

        let pool = 0;
        if (cat === 'iptv') {
            if (duration.includes('3')) pool = 9;
            else if (duration.includes('6')) pool = 12;
            else if (duration.includes('12') || duration.includes('سنة')) pool = 15;
        } else if (cat === 'smartApps' || cat === 'smart') {
            if (duration.includes('12') || duration.includes('سنة')) pool = 10;
            else if (duration.includes('مدى') || duration.toLowerCase().includes('life')) pool = 20;
        } else if (cat === 'vip') {
            pool = 7.5;
        }
        return pool;
    }

    let currentStaffDocUnsubscribe = null;
    let currentWeeklyProfitUnsubscribe = null;
    let currentGivenDocsUnsubscribe = null;

    function setupBalancesListener(uid, staffName) {
        if (currentStaffDocUnsubscribe) currentStaffDocUnsubscribe();
        if (currentWeeklyProfitUnsubscribe) currentWeeklyProfitUnsubscribe();
        if (currentGivenDocsUnsubscribe) currentGivenDocsUnsubscribe();

        let myDocs = [];
        let givenDocs = [];
        let staffData = {};
        let globalWeeklyProfit = 0;
        let currentCashTotal = 0;
        let currentStaffName = staffName;
        let isIbrahim = (staffName || '').includes('ابراهيم');

        // تم حذف حساب الصافي المكرر بناءً على الأمر بأن تعكس النتائج تماماً من المدير
        function updateNetProfitUI() {
            // لا تفعل شيئاً هنا، التحديث يتم في processBalances مباشرة
        }

        function processBalances() {
            let todayLibyanaSales = 0, todayLibyanaWithdrawals = 0;
            let todayAlmadarSales = 0, todayAlmadarWithdrawals = 0;
            let todayCashSales = 0, todayCashWithdrawals = 0;
            let todayTotalProfit = 0;
            let cumulativeDebtCredit = 0;
            let cumulativeDebtCash = 0;

            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

            if (window.allTransactionsDocs) {
                const myDocs = window.allTransactionsDocs.filter(doc => doc.data().staffId === uid);
                myDocs.forEach(doc => {
                    const data = doc.data();
                    const isToday = !data.timestamp || (data.timestamp.toDate().getTime() >= startOfDay);

                    if (data.type === "sale") {
                        const price = parseFloat(data.price) || 0;
                        if (data.method === "ليبيانا" && isToday) todayLibyanaSales += price;
                        if (data.method === "المدار" && isToday) todayAlmadarSales += price;
                        if (data.method === "دفع مشترك (ليبيانا + مدار)" && data.splitDetails && isToday) {
                            todayLibyanaSales += parseFloat(data.splitDetails.libyanaAmount) || 0;
                            todayAlmadarSales += parseFloat(data.splitDetails.almadarAmount) || 0;
                        }
                        if ((data.method === "كاش" || data.method === "دين") && isToday) todayCashSales += price;

                        if (isToday) {
                            todayTotalProfit += window.saleCommission(data);
                        }
                    } else if (data.type === "withdrawal") {
                        const amt = parseFloat(data.amount) || 0;
                        if (data.wallet === "ليبيانا" && isToday) todayLibyanaWithdrawals += amt;
                        if (data.wallet === "المدار" && isToday) todayAlmadarWithdrawals += amt;
                        if (data.wallet === "كاش" && isToday) todayCashWithdrawals += amt;
                    } else if (data.type === "debt_transfer") {
                        const amtCash = parseFloat(data.amount) || 0;
                        const amtCredit = parseFloat(data.originalCredit) || 0;
                        cumulativeDebtCredit += amtCredit;
                        cumulativeDebtCash += amtCash;
                    }
                });
            }

            let libyanaSales = 0, libyanaWithdrawals = 0;
            let almadarSales = 0, almadarWithdrawals = 0;
            let cashSales = 0, cashWithdrawals = 0;
            isIbrahim = currentStaffName.includes('ابراهيم');

            if (window.allTransactionsDocs) {
                window.allTransactionsDocs.forEach(tDoc => {
                    const tData = tDoc.data();

                    if (tData.type === 'sale') {
                        const p = parseFloat(tData.price) || 0;
                        if (tData.method === 'ليبيانا') {
                            const libyanaRecipientId = tData.creditRecipientId || tData.staffId;
                            if (libyanaRecipientId === uid) {
                                libyanaSales += p;
                            }
                        } else if (tData.method === 'المدار') {
                            const almadarRecipientId = tData.creditRecipientId || tData.staffId;
                            if (almadarRecipientId === uid) {
                                almadarSales += p;
                            }
                        } else if (tData.method === 'دفع مشترك (ليبيانا + مدار)' && tData.splitDetails) {
                            if (tData.splitDetails.libyanaRecipientId === uid) {
                                libyanaSales += parseFloat(tData.splitDetails.libyanaAmount) || 0;
                            }
                            if (tData.splitDetails.almadarRecipientId === uid) {
                                almadarSales += parseFloat(tData.splitDetails.almadarAmount) || 0;
                            }
                        } else if (tData.staffId === uid) {
                            if (tData.method === 'كاش' || tData.method === 'دين') {
                                cashSales += p;
                            }
                        }
                    } else if (tData.type === 'withdrawal') {
                        if (tData.staffId === uid) {
                            const amt = parseFloat(tData.amount) || 0;
                            if (tData.wallet === 'ليبيانا') libyanaWithdrawals += amt;
                            if (tData.wallet === 'المدار') almadarWithdrawals += amt;
                            if (tData.wallet === 'كاش') cashWithdrawals += amt;
                        }
                    } else if (tData.type === 'debt_transfer') {
                        if (tData.staffId === uid) {
                            if (!isIbrahim) {
                                const amt = parseFloat(tData.amount) || 0;
                                if (tData.wallet === 'ليبيانا') cashSales += amt;
                                if (tData.wallet === 'المدار') cashSales += amt;
                            }
                        }
                    }

                    if (tData.debtor === currentStaffName || (tData.debtor && (tData.debtor.includes(currentStaffName) || currentStaffName.includes(tData.debtor)))) {
                        if (tData.type === 'debt_transfer') {
                            const origCredit = parseFloat(tData.originalCredit) || 0;
                            if (tData.wallet === 'ليبيانا') libyanaWithdrawals += origCredit;
                            if (tData.wallet === 'المدار') almadarWithdrawals += origCredit;
                        }
                    }
                });
            }

            const baseLibyana = parseFloat(staffData.baseLibyana) || 0;
            const baseAlmadar = parseFloat(staffData.baseAlmadar) || 0;
            const baseCash = parseFloat(staffData.baseCash) || 0;

            const libyanaTotal = libyanaSales - libyanaWithdrawals + baseLibyana;
            const almadarTotal = almadarSales - almadarWithdrawals + baseAlmadar;

            let cashTotal = cashSales - cashWithdrawals + baseCash;
            const baseProfit = parseFloat(staffData.baseProfit) || 0;
            const duesOwed = parseFloat(staffData.duesOwed) || 0;

            // حصة المندوب من ربح الأسبوع حسب القوانين (نفس دالة لوحة المدير والترحيل)
            let earnedProfit = window.staffProfitShare(currentStaffName, globalWeeklyProfit) + baseProfit;
            // ما دفعه المدير مقدماً من ربح هذا الأسبوع: لا يغيّر ربح الأسبوع، ويُطرح عند الترحيل
            const profitAdvance = parseFloat(staffData.profitAdvance) || 0;

            // الصافي = مطلوب كاش − (المستحقات + ربح الأسبوع − السلفة). موجب: على المندوب
            let netAmount = cashTotal - (duesOwed + earnedProfit - profitAdvance);

            // حسابات خاصة بمندوب ابراهيم (حساب المصرفي / سداد / USDT) من مبيعات وسحوبات المناديب
            let bankSales = 0, sadadSales = 0, usdtSales = 0;
            let bankWithdrawals = 0, sadadWithdrawals = 0, usdtWithdrawals = 0;
            if (isIbrahim && window.allTransactionsDocs) {
                window.allTransactionsDocs.forEach(tDoc => {
                    const tData = tDoc.data();
                    if (tData.type === 'sale') {
                        const p = parseFloat(tData.price) || 0;
                        const m = (tData.method || '').trim();
                        if (m === 'تحويلات مصرفية' || m.includes('مصرف')) {
                            bankSales += p;
                        } else if (m === 'سداد' || m.includes('سداد')) {
                            sadadSales += p;
                        } else if (m.toUpperCase() === 'USDT' || m.toUpperCase().includes('USDT')) {
                            usdtSales += p;
                        }
                    } else if (tData.type === 'withdrawal' || tData.type === 'debt_transfer') {
                        const isIbrTrans = (tData.staffId === uid) || (tData.debtor && (tData.debtor.includes('ابراهيم') || currentStaffName.includes(tData.debtor)));
                        if (isIbrTrans) {
                            const amt = parseFloat(tData.amount) || 0;
                            const w = (tData.wallet || '').trim();
                            if (w === 'حساب المصرفي' || w === 'تحويلات مصرفية' || w.includes('مصرف')) {
                                bankWithdrawals += amt;
                            } else if (w === 'سداد' || w.includes('سداد')) {
                                sadadWithdrawals += amt;
                            } else if (w.toUpperCase() === 'USDT' || w.toUpperCase().includes('USDT')) {
                                usdtWithdrawals += amt;
                            }
                        }
                    }
                });
            }

            const baseBank = parseFloat(staffData.baseBank) || 0;
            const baseSadad = parseFloat(staffData.baseSadad) || 0;
            const baseUsdt = parseFloat(staffData.baseUsdt) || 0;

            const bankTotal = bankSales - bankWithdrawals + baseBank;
            const sadadTotal = sadadSales - sadadWithdrawals + baseSadad;
            const usdtTotal = usdtSales - usdtWithdrawals + baseUsdt;

            if (document.getElementById("libyanaBalance")) document.getElementById("libyanaBalance").innerHTML = `<span dir="ltr" style="display: inline-block;">${libyanaTotal.toFixed(2)}</span> <span style="font-size: 0.7rem;">د.ل</span>`;
            if (document.getElementById("almadarBalance")) document.getElementById("almadarBalance").innerHTML = `<span dir="ltr" style="display: inline-block;">${almadarTotal.toFixed(2)}</span> <span style="font-size: 0.7rem;">د.ل</span>`;
            if (document.getElementById("cashBalance")) document.getElementById("cashBalance").innerHTML = `<span dir="ltr" style="display: inline-block;">${cashTotal.toFixed(2)}</span> <span style="font-size: 0.7rem;">د.ل</span>`;

            if (isIbrahim) {
                // تعديل الصناديق لمندوب ابراهيم فقط: حساب المصرفي، سداد، USDT
                const profitCard = document.querySelector('.balance-card-profit');
                if (profitCard) profitCard.className = 'balance-card balance-card-profit balance-card-bank';
                const profitTitleEl = document.getElementById('profitCardTitle') || (profitCard ? profitCard.querySelector('.balance-card-title') : null);
                if (profitTitleEl) profitTitleEl.textContent = 'حساب المصرفي';
                const profitValEl = document.getElementById('profitBalance');
                if (profitValEl) {
                    profitValEl.className = 'balance-card-amount balance-val-bank';
                    profitValEl.innerHTML = `<span class="balance-val-amount card-bank-amount" dir="ltr" style="display: inline-block;">${bankTotal.toFixed(2)}</span> <span class="balance-val-currency" style="font-size: 0.7rem;">د.ل</span>`;
                }

                const duesCard = document.querySelector('.balance-card-dues');
                if (duesCard) duesCard.className = 'balance-card balance-card-dues balance-card-sadad';
                const duesTitleEl = document.getElementById('duesCardTitle') || (duesCard ? duesCard.querySelector('.balance-card-title') : null);
                if (duesTitleEl) duesTitleEl.textContent = 'سداد';
                const duesValEl = document.getElementById('duesBalance');
                if (duesValEl) {
                    duesValEl.className = 'balance-card-amount balance-val-sadad';
                    duesValEl.innerHTML = `<span class="balance-val-amount card-sadad-amount" dir="ltr" style="display: inline-block;">${sadadTotal.toFixed(2)}</span> <span class="balance-val-currency" style="font-size: 0.7rem;">د.ل</span>`;
                }

                const netCard = document.querySelector('.balance-card-net');
                if (netCard) netCard.className = 'balance-card balance-card-net balance-card-usdt';
                const netTitleEl = document.getElementById('netCardTitle') || (netCard ? netCard.querySelector('.balance-card-title') : null);
                if (netTitleEl) netTitleEl.textContent = 'USDT';
                const netValEl = document.getElementById('netBalance');
                if (netValEl) {
                    netValEl.className = 'balance-card-amount balance-val-usdt';
                    netValEl.innerHTML = `<span class="balance-val-amount card-usdt-amount" dir="ltr" style="display: inline-block;">${usdtTotal.toFixed(2)}</span> <span class="balance-val-currency" style="font-size: 0.7rem;">$</span>`;
                }
            } else {
                // باقي المناديب: ربح الأسبوع، مستحقات، الصافي
                const profitCard = document.querySelector('.balance-card-profit');
                if (profitCard) profitCard.className = 'balance-card balance-card-profit';
                const profitTitleEl = document.getElementById('profitCardTitle') || (profitCard ? profitCard.querySelector('.balance-card-title') : null);
                if (profitTitleEl) profitTitleEl.textContent = 'ربح الأسبوع';
                const profitEl = document.querySelector("#profitBalance .card-profit-amount");
                if (profitEl) {
                    profitEl.textContent = earnedProfit.toFixed(2);
                }
                if (profitTitleEl) {
                    profitTitleEl.textContent = profitAdvance > 0.004
                        ? 'ربح الأسبوع (مدفوع مقدماً ' + profitAdvance.toFixed(2) + ')'
                        : 'ربح الأسبوع';
                }

                const duesCard = document.querySelector('.balance-card-dues');
                if (duesCard) duesCard.className = 'balance-card balance-card-dues';
                const duesTitleEl = document.getElementById('duesCardTitle') || (duesCard ? duesCard.querySelector('.balance-card-title') : null);
                if (duesTitleEl) duesTitleEl.textContent = 'مستحقات';
                if (document.getElementById("duesBalance")) document.getElementById("duesBalance").innerHTML = `<span class="balance-val-amount card-dues-amount" dir="ltr" style="display: inline-block;">${duesOwed.toFixed(2)}</span> <span class="balance-val-currency" style="font-size: 0.7rem;">د.ل</span>`;

                const netCard = document.querySelector('.balance-card-net');
                if (netCard) netCard.className = 'balance-card balance-card-net';
                const netTitleEl = document.getElementById('netCardTitle') || (netCard ? netCard.querySelector('.balance-card-title') : null);
                if (netTitleEl) {
                    netTitleEl.textContent = netAmount > 0.004 ? 'الصافي — عليك' : (netAmount < -0.004 ? 'الصافي — لك' : 'الصافي');
                }
                const netEl = document.querySelector("#netBalance .card-net-amount");
                if (netEl) {
                    netEl.textContent = Math.abs(netAmount).toFixed(2);
                    if (netAmount > 0.004) {
                        netEl.style.color = 'var(--danger-color, #f87171)';
                    } else if (netAmount < -0.004) {
                        netEl.style.color = 'var(--success-color, #4ade80)';
                    } else {
                        netEl.style.color = '#ffffff';
                    }
                }
            }

            if (document.getElementById("staffTodayProfit") && !activeFilterStartDate && !activeFilterEndDate) {
                document.getElementById("staffTodayProfit").innerHTML = `${todayTotalProfit.toFixed(2)} <span style="font-size: 1rem;">د.ل</span>`;
            }

            if (document.getElementById("cumulativeDebtCredit")) {
                document.getElementById("cumulativeDebtCredit").innerHTML = `${cumulativeDebtCredit.toFixed(2)} <span style="font-size: 1rem;">د.ل</span>`;
            }
            if (document.getElementById("cumulativeDebtCash")) {
                document.getElementById("cumulativeDebtCash").innerHTML = `${cumulativeDebtCash.toFixed(2)} <span style="font-size: 1rem;">د.ل</span>`;
            }
        }

        // تتبع بيانات المندوب الحي
        currentStaffDocUnsubscribe = db.collection('customers').doc(uid).onSnapshot(doc => {
            if (doc.exists) {
                staffData = doc.data();

                const nameToDisplay = staffData.firstName ? staffData.firstName.trim() : (staffData.name ? staffData.name.trim().split(' ')[0] : (staffName ? staffName.split(' ')[0] : 'مندوب غير معروف'));
                currentStaffName = nameToDisplay;
                isIbrahim = currentStaffName.includes('ابراهيم');

                if (document.getElementById('staffCardName')) {
                    document.getElementById('staffCardName').innerHTML = `<i class="fas fa-user-tie"></i> ${nameToDisplay}`;
                }
                if (document.getElementById('staffCardPhone')) {
                    document.getElementById('staffCardPhone').textContent = staffData.phone || 'غير متوفر';
                }

                if (document.getElementById('debtBoxTitle')) {
                    const first = nameToDisplay.split(' ')[0];
                    document.getElementById('debtBoxTitle').innerHTML = `<i class="fas fa-hand-holding-usd"></i> ديون ${first}`;
                }

                // ترحيل تلقائي لأي أرباح أسبوع سابق لم تُدفع إلى خانة "مستحقات" (للمناديب الثلاثة فقط)
                if (!isIbrahim && typeof window.getCurrentWeekKey === 'function' && staffData.lastWeekStart !== window.getCurrentWeekKey()) {
                    window.rolloverUnpaidWeeklyProfit(uid);
                }

                // الاستماع لجميع العمليات لحساب الأرصدة بدقة (كما تفعل لوحة المدير)
                if (currentGivenDocsUnsubscribe) currentGivenDocsUnsubscribe();
                currentGivenDocsUnsubscribe = db.collection('transactions').onSnapshot(snapshot => {
                    window.allTransactionsDocs = snapshot.docs;
                    processBalances();
                }, err => {
                    console.error("Error listening to all balances:", err);
                });

                processBalances();
            }
        }, err => {
            console.error("Error listening to staff data:", err);
        });


        window.reprocessStaffBalances = processBalances;

        // الاستماع لجميع عمليات الأسبوع الحالي لحساب إجمالي أرباح الشركة
        const d = (typeof window.getLibyaWeekStart === 'function') ? window.getLibyaWeekStart() : (() => {
            const dt = new Date();
            dt.setHours(0, 0, 0, 0);
            const day = dt.getDay();
            const diff = (day === 6) ? 0 : (day + 1);
            dt.setDate(dt.getDate() - diff);
            return dt;
        })();

        let lastWeeklySnapshot = null;
        function recalculateWeeklyProfit() {
            if (!lastWeeklySnapshot) return;
            let total = 0;
            lastWeeklySnapshot.forEach(doc => {
                const data = doc.data();
                total += window.saleCommission(data);
            });
            globalWeeklyProfit = total;
            processBalances();
        }
        window.recalculateWeeklyProfit = recalculateWeeklyProfit;

        currentWeeklyProfitUnsubscribe = db.collection('transactions').where('timestamp', '>=', d).onSnapshot(snapshot => {
            lastWeeklySnapshot = snapshot;
            recalculateWeeklyProfit();
        }, err => {
            console.error("Error listening to global transactions:", err);
        });
    }

    // =============================================
    // سجل حركات المندوب وتصفيته (History & Filter)
    // =============================================
    let staffTransactionsDocs = [];
    let activeFilterStartDate = null;
    let activeFilterEndDate = null;

    function renderStaffHistory() {
        const tbody = document.getElementById('staffHistoryTableBody');
        const logTitleEl = document.getElementById('salesLogTitle');
        const profitTitleEl = document.querySelector('#staffProfitCard .profit-title');
        const profitAmountEl = document.getElementById('staffTodayProfit');

        const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const now = new Date();

        let filterStartMillis = 0;
        let filterEndMillis = Infinity;
        let isMultiDay = false;
        let titleText = '';
        let emptyMsg = 'لا توجد عمليات مسجلة في هذا اليوم';
        let profitCardTitleText = '<i class="fas fa-hand-holding-usd"></i> إجمالي أرباح المبيعات لليوم';

        if (!activeFilterStartDate && !activeFilterEndDate) {
            // الحالة الافتراضية: اليوم الحالي
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            filterStartMillis = startOfDay.getTime();
            filterEndMillis = endOfDay.getTime();

            const dayName = days[now.getDay()];
            const dateStr = now.toLocaleDateString('en-GB');
            titleText = `<i class="fas fa-history"></i> سجل عمليات المندوب (اليوم: ${dayName} ${dateStr})`;
            emptyMsg = 'لا توجد عمليات مسجلة في هذا اليوم';
            profitCardTitleText = '<i class="fas fa-hand-holding-usd"></i> إجمالي أرباح المبيعات لليوم';
        } else {
            filterStartMillis = activeFilterStartDate.getTime();
            filterEndMillis = activeFilterEndDate.getTime();

            const isSameDay = activeFilterStartDate.toDateString() === activeFilterEndDate.toDateString();
            if (isSameDay) {
                isMultiDay = false;
                const dayName = days[activeFilterStartDate.getDay()];
                const dateStr = activeFilterStartDate.toLocaleDateString('en-GB');
                titleText = `<i class="fas fa-history"></i> سجل عمليات المندوب (اليوم: ${dayName} ${dateStr})`;
                emptyMsg = 'لا توجد عمليات مسجلة في هذا اليوم';
                profitCardTitleText = '<i class="fas fa-hand-holding-usd"></i> إجمالي أرباح المبيعات لليوم';
            } else {
                isMultiDay = true;
                const startStr = activeFilterStartDate.toLocaleDateString('en-GB');
                const endStr = activeFilterEndDate.toLocaleDateString('en-GB');
                titleText = `<i class="fas fa-history"></i> سجل عمليات المندوب (الفترة: من ${startStr} إلى ${endStr})`;
                emptyMsg = 'لا توجد عمليات مسجلة في هذه الفترة';
                profitCardTitleText = '<i class="fas fa-hand-holding-usd"></i> إجمالي أرباح المبيعات للفترة المحددة';
            }
        }

        if (logTitleEl) logTitleEl.innerHTML = titleText;
        if (profitTitleEl) profitTitleEl.innerHTML = profitCardTitleText;

        // فرز و تصفية العمليات
        const sortedDocs = [...staffTransactionsDocs];
        sortedDocs.sort((a, b) => {
            const dataA = a.data();
            const dataB = b.data();
            const tA = (dataA.timestamp && typeof dataA.timestamp.toMillis === 'function') ? dataA.timestamp.toMillis() : (dataA.timestamp ? new Date(dataA.timestamp).getTime() : Date.now());
            const tB = (dataB.timestamp && typeof dataB.timestamp.toMillis === 'function') ? dataB.timestamp.toMillis() : (dataB.timestamp ? new Date(dataB.timestamp).getTime() : Date.now());
            return tB - tA;
        });

        let filteredProfit = 0;
        let matchingCount = 0;
        let html = '';

        sortedDocs.forEach(doc => {
            const data = doc.data();
            const tMillis = (data.timestamp && typeof data.timestamp.toMillis === 'function') ? data.timestamp.toMillis() : (data.timestamp ? new Date(data.timestamp).getTime() : Date.now());

            // التحقق من النطاق الزمني
            if (tMillis < filterStartMillis || tMillis > filterEndMillis) {
                return;
            }

            matchingCount++;

            // حساب الربح للعمليات المفلترة
            if (data.type === 'sale') {
                filteredProfit += window.saleCommission(data);
            }

            let dateStr = 'الآن';
            if (data.timestamp) {
                const d = (typeof data.timestamp.toDate === 'function') ? data.timestamp.toDate() : new Date(data.timestamp);
                const formattedTime = new Intl.DateTimeFormat('en-US', {
                    hour: '2-digit', minute: '2-digit', hour12: true
                }).format(d);

                if (isMultiDay) {
                    const dFormatted = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                    dateStr = `<span dir="ltr">${dFormatted} ${formattedTime}</span>`;
                } else {
                    dateStr = `<span dir="ltr">${formattedTime}</span>`;
                }
            }

            if (data.type === 'sale') {
                let methodDisplay = data.method || '-';
                if ((data.method === 'ليبيانا' || data.method === 'المدار') && data.creditRecipientName) {
                    const rName = data.creditRecipientName.split(' ')[0];
                    methodDisplay += ` <br><span style="font-size:0.75rem; color:#888;">(الرصيد لـ: ${rName})</span>`;
                } else if (data.method === 'دفع مشترك (ليبيانا + مدار)' && data.splitDetails) {
                    const lName = data.splitDetails.libyanaRecipientName ? data.splitDetails.libyanaRecipientName.split(' ')[0] : '';
                    const aName = data.splitDetails.almadarRecipientName ? data.splitDetails.almadarRecipientName.split(' ')[0] : '';
                    methodDisplay = `<span style="font-weight:bold; color:#58a6ff;">دفع مشترك:</span><br>` +
                        `<span style="font-size:0.75rem; color:#c084fc;">ليبيانا: ${data.splitDetails.libyanaAmount} د.ل (${lName})</span><br>` +
                        `<span style="font-size:0.75rem; color:#81c784;">المدار: ${data.splitDetails.almadarAmount} د.ل (${aName})</span>`;
                }
                let badgeText = 'مبيعة';
                const isIbrUser = isCurrentStaffIbrahim();
                const isDirectWithoutProduct = (data.isDirectSale || data.product === 'مبيعة مباشرة' || !data.duration);
                if (isIbrUser && isDirectWithoutProduct) {
                    const m = (data.method || '').trim();
                    if (m === 'تحويلات مصرفية' || m.includes('مصرف')) {
                        badgeText = 'اضافة رصيد مصرفي';
                    } else if (m === 'سداد' || m.includes('سداد')) {
                        badgeText = 'اضافة سداد';
                    } else if (m.toUpperCase() === 'USDT' || m.toUpperCase().includes('USDT')) {
                        badgeText = 'اضافة USDT';
                    } else if (m === 'كاش') {
                        badgeText = 'اضافة كاش';
                    } else if (m === 'ليبيانا' || m === 'المدار' || m.includes('مشترك')) {
                        badgeText = 'اضافة رصيد';
                    }
                }

                html += `
                  <tr>
                      <td style="text-align: right;">${dateStr}</td>
                      <td><span class="badge badge-sale">${badgeText}</span></td>
                      <td>${data.product || ''} ${data.duration ? ' - ' + data.duration : ''}</td>
                      <td>${data.price}</td>
                      <td>${methodDisplay}</td>
                      <td><button class="btn-delete-trans" onclick="deleteTransaction('${doc.id}')" title="إلغاء العملية"><i class="fas fa-trash"></i></button></td>
                  </tr>
                `;
            } else if (data.type === 'withdrawal') {
                let badgeText = 'سحب رصيد';
                const w = (data.wallet || '').trim();
                if (w === 'كاش') badgeText = 'سحب كاش';
                else if (w === 'حساب المصرفي' || w === 'تحويلات مصرفية' || w.includes('مصرف')) badgeText = 'سحب مصرفي';
                else if (w === 'سداد' || w.includes('سداد')) badgeText = 'سحب سداد';
                else if (w.toUpperCase() === 'USDT' || w.toUpperCase().includes('USDT')) badgeText = 'سحب USDT';

                const debtorFirst = data.debtor ? data.debtor.split(' ')[0] : '';
                const displayReason = data.reason || (debtorFirst ? `من: ${debtorFirst}` : '-');
                let walletDisplay = data.wallet || '-';
                if (debtorFirst && data.reason && data.reason !== data.debtor) {
                    walletDisplay += ` <br><span style="font-size:0.75rem; color:#888;">(من: ${debtorFirst})</span>`;
                }
                html += `
                  <tr>
                      <td style="text-align: right;">${dateStr}</td>
                      <td><span class="badge badge-withdrawal">${badgeText}</span></td>
                      <td>${displayReason}</td>
                      <td>${data.amount}</td>
                      <td>${walletDisplay}</td>
                      <td><button class="btn-delete-trans" onclick="deleteTransaction('${doc.id}')" title="إلغاء العملية"><i class="fas fa-trash"></i></button></td>
                  </tr>
                `;
            } else if (data.type === 'debt_transfer') {
                const debtorFirst = data.debtor ? data.debtor.split(' ')[0] : '';
                const convFactor = (window.currentStaffRules && window.currentStaffRules.transfers && !isNaN(window.currentStaffRules.transfers.debtCreditFactor))
                    ? Number(window.currentStaffRules.transfers.debtCreditFactor)
                    : 0.75;
                const rawVal = (data.originalCredit !== undefined && data.originalCredit !== null && data.originalCredit !== '')
                    ? Number(data.originalCredit)
                    : ((data.wallet === 'ليبيانا' || data.wallet === 'المدار') && data.amount ? Math.round(Number(data.amount) / convFactor) : Number(data.amount));
                const transferVal = isNaN(rawVal) ? (data.originalCredit || data.amount) : (rawVal % 1 === 0 ? rawVal : rawVal.toFixed(2));
                let badgeText = 'سحب رصيد';
                const w = (data.wallet || '').trim();
                if (w === 'كاش') badgeText = 'سحب كاش';
                else if (w === 'حساب المصرفي' || w === 'تحويلات مصرفية' || w.includes('مصرف')) badgeText = 'سحب مصرفي';
                else if (w === 'سداد' || w.includes('سداد')) badgeText = 'سحب سداد';
                else if (w.toUpperCase() === 'USDT' || w.toUpperCase().includes('USDT')) badgeText = 'سحب USDT';

                const displayReason = data.reason || (debtorFirst ? `من: ${debtorFirst}` : '-');
                let walletDisplay = data.wallet || '-';
                if (debtorFirst && data.reason && data.reason !== data.debtor) {
                    walletDisplay += ` <br><span style="font-size:0.75rem; color:#888;">(من: ${debtorFirst})</span>`;
                }
                html += `
                  <tr>
                      <td style="text-align: right;">${dateStr}</td>
                      <td><span class="badge badge-debt">${badgeText}</span></td>
                      <td>${displayReason}</td>
                      <td>${transferVal}</td>
                      <td>${walletDisplay}</td>
                      <td><button class="btn-delete-trans" onclick="deleteTransaction('${doc.id}')" title="إلغاء العملية"><i class="fas fa-trash"></i></button></td>
                  </tr>
                `;
            }
        });

        if (profitAmountEl) {
            profitAmountEl.innerHTML = `${filteredProfit.toFixed(2)} <span style="font-size: 1rem;">د.ل</span>`;
        }

        if (tbody) {
            if (matchingCount === 0 || html === '') {
                tbody.innerHTML = `<tr><td colspan="6" class="table-empty-message">${emptyMsg}</td></tr>`;
            } else {
                tbody.innerHTML = html;
            }
        }
    }

    let currentHistoryUnsubscribe = null;
    function setupHistoryListener(uid) {
        if (currentHistoryUnsubscribe) currentHistoryUnsubscribe();
        currentHistoryUnsubscribe = db.collection('transactions')
            .where('staffId', '==', uid)
            .onSnapshot({ includeMetadataChanges: true }, snapshot => {
                staffTransactionsDocs = snapshot.docs;
                renderStaffHistory();
            }, err => {
                console.error("Error listening to history:", err);
            });
    }

    // دوال تصفية السجل المتاحة في window
    window.searchHistory = function () {
        const startInput = document.getElementById('historyStartDate') ? document.getElementById('historyStartDate').value.trim() : '';
        const endInput = document.getElementById('historyEndDate') ? document.getElementById('historyEndDate').value.trim() : '';

        if (!startInput && !endInput) {
            if (typeof showToast === 'function') {
                showToast("يرجى اختيار تاريخ للبحث", "warning");
            } else {
                showAlert("يرجى اختيار تاريخ للبحث");
            }
            return;
        }

        let startDate = null;
        let endDate = null;

        if (startInput) {
            const [y, m, d] = startInput.split('-').map(Number);
            startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
        }

        if (endInput) {
            const [y, m, d] = endInput.split('-').map(Number);
            endDate = new Date(y, m - 1, d, 23, 59, 59, 999);
        }

        // إذا اختار تاريخ واحد فقط في أحد الحقلين
        if (startDate && !endDate) {
            endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 23, 59, 59, 999);
        } else if (!startDate && endDate) {
            startDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 0, 0, 0, 0);
        }

        if (startDate > endDate) {
            if (typeof showToast === 'function') {
                showToast("تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية", "error");
            } else {
                showAlert("تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية");
            }
            return;
        }

        activeFilterStartDate = startDate;
        activeFilterEndDate = endDate;
        renderStaffHistory();
    };

    window.resetHistory = function () {
        const startEl = document.getElementById('historyStartDate');
        const endEl = document.getElementById('historyEndDate');

        if (startEl) {
            startEl.value = '';
            if (startEl._flatpickr) startEl._flatpickr.clear();
        }
        if (endEl) {
            endEl.value = '';
            if (endEl._flatpickr) endEl._flatpickr.clear();
        }

        activeFilterStartDate = null;
        activeFilterEndDate = null;
        renderStaffHistory();
    };

    // =============================================
    // 4. إعداد وتجهيز النماذج (تسجيل بيع / تسجيل سحب)
    // =============================================
    async function setupForms(uid) {
        if (window.staffFormsInitialized) return;
        window.staffFormsInitialized = true;

        // --- إدارة قوائم المنتجات والمدة ---
        const selectCategory = document.getElementById('saleProductCategory');
        const selectItemContainer = document.getElementById('saleProductItemContainer');
        const selectItem = document.getElementById('saleProductItem');
        const itemLabel = document.getElementById('saleProductItemLabel');
        const selectDuration = document.getElementById('saleDuration');
        const saleMethodSelect = document.getElementById('saleMethod');
        const saleRecipientContainer = document.getElementById('saleRecipientContainer');
        const saleRecipientSelect = document.getElementById('saleRecipient');

        const saleSplitContainer = document.getElementById('saleSplitContainer');
        const splitLibyanaAmountInput = document.getElementById('splitLibyanaAmount');
        const splitLibyanaRecipientSelect = document.getElementById('splitLibyanaRecipient');
        const splitAlmadarAmountInput = document.getElementById('splitAlmadarAmount');
        const splitAlmadarRecipientSelect = document.getElementById('splitAlmadarRecipient');

        function resetSaleForm() {
            if (selectCategory) {
                selectCategory.selectedIndex = 0;
                selectCategory.value = '';
            }
            if (selectItem) {
                selectItem.innerHTML = '<option value="" selected>اختر نوع المنتج أولاً...</option>';
                selectItem.selectedIndex = 0;
                selectItem.value = '';
            }
            if (selectItemContainer) {
                selectItemContainer.classList.add('hidden-group');
            }
            if (selectDuration) {
                selectDuration.innerHTML = '<option value="" selected>اختر المنتج أولاً...</option>';
                selectDuration.selectedIndex = 0;
                selectDuration.value = '';
            }
            const priceInput = document.getElementById('salePrice');
            if (priceInput) priceInput.value = '';

            if (saleMethodSelect) {
                saleMethodSelect.selectedIndex = 0;
                saleMethodSelect.value = '';
            }
            if (saleRecipientSelect) {
                saleRecipientSelect.selectedIndex = 0;
                saleRecipientSelect.value = '';
            }
            if (saleRecipientContainer) {
                saleRecipientContainer.classList.add('hidden-group');
            }
            if (splitLibyanaAmountInput) splitLibyanaAmountInput.value = '';
            if (splitAlmadarAmountInput) splitAlmadarAmountInput.value = '';
            if (splitLibyanaRecipientSelect) {
                splitLibyanaRecipientSelect.selectedIndex = 0;
                splitLibyanaRecipientSelect.value = '';
            }
            if (splitAlmadarRecipientSelect) {
                splitAlmadarRecipientSelect.selectedIndex = 0;
                splitAlmadarRecipientSelect.value = '';
            }
            if (saleSplitContainer) {
                saleSplitContainer.classList.add('hidden-group');
            }
        }

        function populateDurations(category, productName) {
            selectDuration.innerHTML = '<option value="" selected>اختر المدة / الباقة...</option>';

            if (category === 'iptv') {
                selectDuration.insertAdjacentHTML('beforeend', '<option value="3 أشهر" data-points="9">3 أشهر (9 د.ل)</option>');
                selectDuration.insertAdjacentHTML('beforeend', '<option value="6 أشهر" data-points="12">6 أشهر (12 د.ل)</option>');
                selectDuration.insertAdjacentHTML('beforeend', '<option value="12 شهر" data-points="15">12 شهر (15 د.ل)</option>');
            } else if (category === 'smartApps' || category === 'smart') {
                selectDuration.insertAdjacentHTML('beforeend', '<option value="سنة واحدة" data-points="10">سنة واحدة (10 د.ل)</option>');
                selectDuration.insertAdjacentHTML('beforeend', '<option value="مدى الحياة" data-points="20">مدى الحياة (20 د.ل)</option>');
            } else if (category === 'vip') {
                selectDuration.insertAdjacentHTML('beforeend', '<option value="شهر واحد" data-points="7.5">شهر واحد (7.5 د.ل)</option>');
                selectDuration.insertAdjacentHTML('beforeend', '<option value="3 أشهر" data-points="7.5">3 أشهر (7.5 د.ل)</option>');
                selectDuration.insertAdjacentHTML('beforeend', '<option value="6 أشهر" data-points="7.5">6 أشهر (7.5 د.ل)</option>');
                selectDuration.insertAdjacentHTML('beforeend', '<option value="سنة واحدة" data-points="7.5">سنة واحدة (7.5 د.ل)</option>');
            } else {
                selectDuration.innerHTML = '<option value="" selected>اختر المنتج أولاً...</option>';
            }
        }

        selectCategory.addEventListener('change', () => {
            const cat = selectCategory.value;
            selectItem.innerHTML = '<option value="" selected>اختر المنتج...</option>';
            selectDuration.innerHTML = '<option value="" selected>اختر المنتج أولاً...</option>';

            if (cat && window.allProductsData && window.allProductsData[cat]) {
                selectItemContainer.classList.remove('hidden-group');
                if (cat === 'iptv') itemLabel.textContent = 'اختر سيرفر الـ IPTV';
                else if (cat === 'smartApps') itemLabel.textContent = 'اختر برنامج سمارت';
                else if (cat === 'vip') itemLabel.textContent = 'اختر باقة VIP';

                window.allProductsData[cat].forEach(p => {
                    const option = document.createElement('option');
                    option.value = p.name;
                    option.textContent = p.name + (p.price ? ` - ${p.price} د.ل` : '');
                    selectItem.appendChild(option);
                });

                if (window.allProductsData[cat].length === 1) {
                    selectItem.selectedIndex = 1;
                    populateDurations(cat, selectItem.value);
                }
            } else {
                selectItemContainer.classList.add('hidden-group');
            }
        });

        selectItem.addEventListener('change', () => {
            if (selectItem.value) {
                populateDurations(selectCategory.value, selectItem.value);
            } else {
                populateDurations('', '');
            }
        });

        // --- التحكم في إظهار حقول الدفع واستلام الرصيد ---
        if (saleMethodSelect) {
            saleMethodSelect.addEventListener('change', () => {
                const method = saleMethodSelect.value;
                if (method === 'ليبيانا' || method === 'المدار') {
                    if (saleRecipientContainer) saleRecipientContainer.classList.remove('hidden-group');
                    if (saleSplitContainer) saleSplitContainer.classList.add('hidden-group');
                    if (saleRecipientSelect) {
                        saleRecipientSelect.selectedIndex = 0;
                        saleRecipientSelect.value = '';
                    }
                } else if (method === 'دفع مشترك (ليبيانا + مدار)') {
                    if (saleRecipientContainer) saleRecipientContainer.classList.add('hidden-group');
                    if (saleSplitContainer) saleSplitContainer.classList.remove('hidden-group');
                    if (saleRecipientSelect) {
                        saleRecipientSelect.selectedIndex = 0;
                        saleRecipientSelect.value = '';
                    }
                    // حساب ذكي افتراضي إذا كان السعر مدخلاً
                    const priceInput = document.getElementById('salePrice');
                    const curPrice = priceInput ? parseFloat(priceInput.value) : 0;
                    if (curPrice > 0 && splitLibyanaAmountInput && !splitLibyanaAmountInput.value) {
                        const half = Math.round((curPrice / 2) * 100) / 100;
                        splitLibyanaAmountInput.value = half;
                        if (splitAlmadarAmountInput) splitAlmadarAmountInput.value = (curPrice - half).toFixed(2);
                    }
                } else {
                    if (saleRecipientContainer) saleRecipientContainer.classList.add('hidden-group');
                    if (saleSplitContainer) saleSplitContainer.classList.add('hidden-group');
                    if (saleRecipientSelect) {
                        saleRecipientSelect.selectedIndex = 0;
                        saleRecipientSelect.value = '';
                    }
                }
            });
        }

        // الحساب التلقائي المتبادل بين رصيد ليبيانا والمدار
        if (splitLibyanaAmountInput && splitAlmadarAmountInput) {
            splitLibyanaAmountInput.addEventListener('input', () => {
                const priceInput = document.getElementById('salePrice');
                const totalPrice = priceInput ? parseFloat(priceInput.value) : 0;
                const libyanaVal = parseFloat(splitLibyanaAmountInput.value);
                if (!isNaN(libyanaVal) && totalPrice > 0) {
                    const remaining = Math.max(0, totalPrice - libyanaVal);
                    splitAlmadarAmountInput.value = (remaining > 0) ? remaining : '';
                }
            });

            splitAlmadarAmountInput.addEventListener('input', () => {
                const priceInput = document.getElementById('salePrice');
                const totalPrice = priceInput ? parseFloat(priceInput.value) : 0;
                const almadarVal = parseFloat(splitAlmadarAmountInput.value);
                if (!isNaN(almadarVal) && totalPrice > 0) {
                    const remaining = Math.max(0, totalPrice - almadarVal);
                    splitLibyanaAmountInput.value = (remaining > 0) ? remaining : '';
                }
            });
        }

        // --- تسجيل البيع (النسخة المحدثة بدعم النقاط وتوجيه المخزن) ---
        document.getElementById('btnRecordSale').addEventListener('click', async () => {
            const btn = document.getElementById('btnRecordSale');
            if (btn && btn.disabled) return;

            const cat = selectCategory ? selectCategory.value : '';
            const product = selectItem ? selectItem.value : (document.getElementById('saleProductItem') ? document.getElementById('saleProductItem').value : '');
            const duration = selectDuration ? selectDuration.value : (document.getElementById('saleDuration') ? document.getElementById('saleDuration').value : '');

            // استثناء للمندوب ابراهيم: يمكنه تسجيل مبيعة مباشرة بدون اختيار نوع المنتج أو الباقة أو عدد النقاط
            const isIbrahimUser = isCurrentStaffIbrahim();
            const isProductSpecified = !!(cat && product && duration);

            if (!isIbrahimUser || isProductSpecified) {
                if (!cat) {
                    if (typeof showToast === 'function') showToast('يرجى اختيار نوع المنتج (IPTV / سمارت / VIP)', 'error');
                    else showAlert('يرجى اختيار نوع المنتج');
                    if (selectCategory) selectCategory.focus();
                    return;
                }

                if (!product) {
                    if (typeof showToast === 'function') showToast('يرجى اختيار اسم المنتج من القائمة', 'error');
                    else showAlert('يرجى اختيار اسم المنتج');
                    if (selectItem) selectItem.focus();
                    return;
                }

                if (!duration) {
                    if (typeof showToast === 'function') showToast('يرجى اختيار المدة / الباقة', 'error');
                    else showAlert('يرجى اختيار المدة / الباقة');
                    if (selectDuration) selectDuration.focus();
                    return;
                }
            }

            const priceInput = document.getElementById('salePrice');
            const price = priceInput ? parseFloat(priceInput.value) : NaN;
            if (isNaN(price) || price <= 0) {
                if (typeof showToast === 'function') showToast('يرجى إدخال سعر البيع بشكل صحيح', 'error');
                else showAlert('يرجى إدخال سعر البيع');
                if (priceInput) priceInput.focus();
                return;
            }

            const method = saleMethodSelect ? saleMethodSelect.value : (document.getElementById('saleMethod') ? document.getElementById('saleMethod').value : '');
            if (!method) {
                if (typeof showToast === 'function') showToast('الرجاء اختيار طريقة الدفع المستلمة', 'error');
                else showAlert('الرجاء اختيار طريقة الدفع المستلمة');
                if (saleMethodSelect) saleMethodSelect.focus();
                return;
            }

            let creditRecipientId = null;
            let creditRecipientName = null;
            let splitDetails = null;

            if (method === 'ليبيانا' || method === 'المدار') {
                if (!saleRecipientSelect || !saleRecipientSelect.value) {
                    if (typeof showToast === 'function') showToast('الرجاء اختيار لمن الرصيد (المندوب المستلم) قبل تسجيل المبيعة', 'error');
                    else showAlert('الرجاء اختيار لمن الرصيد (المندوب المستلم) قبل تسجيل المبيعة');
                    if (saleRecipientSelect) saleRecipientSelect.focus();
                    return;
                }

                creditRecipientId = saleRecipientSelect.value;
                const selectedOption = (saleRecipientSelect.selectedIndex >= 0) ? saleRecipientSelect.options[saleRecipientSelect.selectedIndex] : null;
                creditRecipientName = selectedOption ? selectedOption.text.replace(/\s*\(.*?\)\s*/g, '').trim().split(' ')[0] : (currentStaffName ? currentStaffName.split(' ')[0] : 'مندوب');
            } else if (method === 'دفع مشترك (ليبيانا + مدار)') {
                const libVal = splitLibyanaAmountInput ? parseFloat(splitLibyanaAmountInput.value) : NaN;
                const almVal = splitAlmadarAmountInput ? parseFloat(splitAlmadarAmountInput.value) : NaN;

                if (isNaN(libVal) || libVal <= 0) {
                    if (typeof showToast === 'function') showToast('يرجى إدخال قيمة رصيد ليبيانا بشكل صحيح', 'error');
                    else showAlert('يرجى إدخال قيمة رصيد ليبيانا بشكل صحيح');
                    if (splitLibyanaAmountInput) splitLibyanaAmountInput.focus();
                    return;
                }

                if (isNaN(almVal) || almVal <= 0) {
                    if (typeof showToast === 'function') showToast('يرجى إدخال قيمة رصيد المدار بشكل صحيح', 'error');
                    else showAlert('يرجى إدخال قيمة رصيد المدار بشكل صحيح');
                    if (splitAlmadarAmountInput) splitAlmadarAmountInput.focus();
                    return;
                }

                if (Math.abs((libVal + almVal) - price) > 0.01) {
                    const sum = (libVal + almVal).toFixed(2);
                    if (typeof showToast === 'function') showToast(`مجموع قيمتي ليبيانا والمدار (${sum} د.ل) لا يساوي سعر البيع الإجمالي (${price} د.ل)`, 'error');
                    else showAlert(`مجموع قيمتي ليبيانا والمدار (${sum} د.ل) لا يساوي سعر البيع الإجمالي (${price} د.ل)`);
                    return;
                }

                if (!splitLibyanaRecipientSelect || !splitLibyanaRecipientSelect.value) {
                    if (typeof showToast === 'function') showToast('الرجاء اختيار مستلم رصيد ليبيانا', 'error');
                    else showAlert('الرجاء اختيار مستلم رصيد ليبيانا');
                    if (splitLibyanaRecipientSelect) splitLibyanaRecipientSelect.focus();
                    return;
                }

                if (!splitAlmadarRecipientSelect || !splitAlmadarRecipientSelect.value) {
                    if (typeof showToast === 'function') showToast('الرجاء اختيار مستلم رصيد المدار', 'error');
                    else showAlert('الرجاء اختيار مستلم رصيد المدار');
                    if (splitAlmadarRecipientSelect) splitAlmadarRecipientSelect.focus();
                    return;
                }

                const libOpt = splitLibyanaRecipientSelect.options[splitLibyanaRecipientSelect.selectedIndex];
                const almOpt = splitAlmadarRecipientSelect.options[splitAlmadarRecipientSelect.selectedIndex];

                splitDetails = {
                    libyanaAmount: Number(libVal) || 0,
                    libyanaRecipientId: String(splitLibyanaRecipientSelect.value),
                    libyanaRecipientName: libOpt ? libOpt.text.replace(/\s*\(.*?\)\s*/g, '').trim().split(' ')[0] : 'مندوب',
                    almadarAmount: Number(almVal) || 0,
                    almadarRecipientId: String(splitAlmadarRecipientSelect.value),
                    almadarRecipientName: almOpt ? almOpt.text.replace(/\s*\(.*?\)\s*/g, '').trim().split(' ')[0] : 'مندوب'
                };
            }

            // ربح البيعة يُحسب الآن من القوانين ويُحفظ معها: لا يتغيّر لاحقاً إن تغيّرت أسعار
            // العمولة، وبيعة "الدين" ربحها 0. (كان يُحسب ولا يُحفظ، فتُعطى بيعة الدين ربحاً
            // كاملاً عند إعادة الحساب.)
            let saleCommissionValue = 0;
            if (isProductSpecified && method !== 'دين' && typeof window.calculateTotalCommission === 'function') {
                saleCommissionValue = Number(window.calculateTotalCommission(product, duration, cat)) || 0;
            }

            let currentStaffId = uid;
            if (auth.currentUser) {
                currentStaffId = auth.currentUser.uid;
                try {
                    await auth.currentUser.getIdToken();
                } catch (tokErr) {
                    console.warn("Token check warning:", tokErr);
                }
            }

            if (!currentStaffId) {
                if (typeof showToast === 'function') showToast('انتهت الجلسة، يرجى تسجيل الدخول مجدداً', 'error');
                return;
            }

            try {
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التسجيل...';
                }

                // التحقق من أن المندوب أدخل عدد النقاط (يدعم الأعداد الصحيحة والكسور مثل 10.50)
                const pointsInput = document.getElementById('salePoints');
                const pointsRaw = pointsInput ? pointsInput.value.trim() : '';
                let pointsToDeduct = 0;

                if (!isIbrahimUser) {
                    if (pointsRaw === '' || isNaN(parseFloat(pointsRaw)) || parseFloat(pointsRaw) <= 0) {
                        if (typeof showToast === 'function') showToast('يرجى إدخال عدد النقاط المسحوبة من المخزن بشكل صحيح (أكبر من الصفر)', 'error');
                        else showAlert('يرجى إدخال عدد النقاط');
                        if (pointsInput) pointsInput.focus();
                        return;
                    }
                    pointsToDeduct = parseFloat(pointsRaw);
                } else {
                    // استثناء لإبراهيم: إذا لم يحدد منتجاً لا تُطلب النقاط، وإذا حدد منتجاً وأدخل نقاطاً يتم اعتمادها
                    if (isProductSpecified && pointsRaw !== '' && !isNaN(parseFloat(pointsRaw)) && parseFloat(pointsRaw) > 0) {
                        pointsToDeduct = parseFloat(pointsRaw);
                    } else {
                        pointsToDeduct = 0;
                    }
                }

                const saleData = {
                    type: 'sale',
                    staffId: currentStaffId,
                    product: isProductSpecified ? String(product) : (product ? String(product) : 'مبيعة مباشرة'),
                    duration: isProductSpecified ? String(duration) : '',
                    category: isProductSpecified ? cat : '',
                    isDirectSale: !isProductSpecified,
                    // تم تغيير الاسم إلى inventoryPointsDeducted لمنع تداخل أرباح المندوب
                    inventoryPointsDeducted: pointsToDeduct,
                    commission: saleCommissionValue,
                    price: Number(price) || 0,
                    method: String(method),
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };

                if (creditRecipientId) {
                    saleData.creditRecipientId = String(creditRecipientId);
                    saleData.creditRecipientName = String(creditRecipientName || '');
                }

                if (splitDetails) {
                    saleData.splitDetails = splitDetails;
                }

                await db.collection('transactions').add(saleData);

                // توجيه الخصم تلقائياً للمخزن الصحيح فقط في حال تحديد منتج ووجود نقاط للخصم
                if (isProductSpecified && pointsToDeduct > 0) {
                    let inventoryItemName = String(product);
                    if (cat === 'smartApps' || cat === 'smart') {
                        const appName = String(product).trim().toLowerCase();
                        const iboOneApps = ['ibo one', 'iboplayer3', 'duplex pro', 'kemet tv'];

                        if (iboOneApps.some(app => appName.includes(app))) {
                            inventoryItemName = 'ibo-one';
                        } else {
                            inventoryItemName = 'ibo-bob';
                        }
                    } else if (cat === 'vip') {
                        inventoryItemName = 'باقات VIP';
                    }

                    try {
                        await db.collection('inventory').doc(inventoryItemName).set({
                            count: firebase.firestore.FieldValue.increment(-pointsToDeduct),
                            category: cat,
                            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                    } catch (invErr) {
                        console.warn('تعذر تحديث المخزن:', invErr);
                    }
                }

                if (typeof logActivity === 'function') {
                    logActivity({
                        action: 'staff_sale',
                        category: 'sales',
                        severity: 'success',
                        title: 'تسجيل مبيعة مندوب: ' + (saleData.product || ''),
                        details: { product: saleData.product, duration: saleData.duration, price: saleData.price, method: saleData.method, inventoryPointsDeducted: saleData.inventoryPointsDeducted }
                    });
                }

                if (typeof showToast === 'function') showToast('تم تسجيل المبيعة بنجاح', 'success');
                resetSaleForm();

                const pointsInputAfter = document.getElementById('salePoints');
                if (pointsInputAfter) pointsInputAfter.value = '';

            } catch (err) {
                console.error('Error recording sale:', err);
                if (typeof showToast === 'function') showToast('حدث خطأ أثناء تسجيل المبيعة: ' + (err.message || ''), 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-save"></i> تسجيل المبيعة';
                }
            }
        });

        // --- منطق نموذج السحب / الديون الجديد ---
        const amountInput = document.getElementById('withdrawalAmount');
        const calcText = document.getElementById('cashCalcText');
        const walletSelect = document.getElementById('withdrawalWallet');
        const debtorGroupLabel = document.getElementById('debtorGroupLabel');
        const debtorSelect = document.getElementById('debtorName');
        const withdrawalReasonInput = document.getElementById('withdrawalReason');
        const btnRecordWithdrawal = document.getElementById('btnRecordWithdrawal');

        function updateWithdrawalFormLabels() {
            const wVal = walletSelect ? walletSelect.value : '';
            const amountLabel = document.getElementById('withdrawalAmountLabel');
            if (wVal === 'كاش') {
                if (debtorGroupLabel) debtorGroupLabel.textContent = 'سحب كاش من';
                if (debtorSelect && debtorSelect.options.length > 0) {
                    debtorSelect.options[0].textContent = 'اختر الشخص المسحوب منه الكاش...';
                }
                if (withdrawalReasonInput) {
                    withdrawalReasonInput.placeholder = 'أدخل سبب سحب الكاش (إجباري)...';
                }
                if (btnRecordWithdrawal) {
                    btnRecordWithdrawal.innerHTML = '<i class="fas fa-minus-circle"></i> تسجيل سحب كاش';
                }
                if (amountLabel) amountLabel.textContent = 'القيمة المسحوبة (د.ل)';
            } else if (wVal === 'ليبيانا' || wVal === 'المدار') {
                if (debtorGroupLabel) debtorGroupLabel.textContent = 'سحب رصيد من';
                if (debtorSelect && debtorSelect.options.length > 0) {
                    debtorSelect.options[0].textContent = 'اختر الشخص المسحوب منه الرصيد...';
                }
                if (withdrawalReasonInput) {
                    withdrawalReasonInput.placeholder = 'أدخل سبب سحب الرصيد (إجباري)...';
                }
                if (btnRecordWithdrawal) {
                    btnRecordWithdrawal.innerHTML = '<i class="fas fa-minus-circle"></i> تسجيل سحب رصيد';
                }
                if (amountLabel) amountLabel.textContent = 'القيمة المسحوبة (د.ل)';
            } else if (wVal === 'حساب المصرفي' || wVal === 'تحويلات مصرفية' || wVal.includes('مصرف')) {
                if (debtorGroupLabel) debtorGroupLabel.textContent = 'سحب مصرفي من';
                if (debtorSelect && debtorSelect.options.length > 0) {
                    debtorSelect.options[0].textContent = 'اختر الشخص المسحوب منه السحب المصرفي...';
                }
                if (withdrawalReasonInput) {
                    withdrawalReasonInput.placeholder = 'أدخل سبب السحب المصرفي (إجباري)...';
                }
                if (btnRecordWithdrawal) {
                    btnRecordWithdrawal.innerHTML = '<i class="fas fa-minus-circle"></i> تسجيل سحب مصرفي';
                }
                if (amountLabel) amountLabel.textContent = 'القيمة المسحوبة (د.ل)';
            } else if (wVal === 'سداد' || wVal.includes('سداد')) {
                if (debtorGroupLabel) debtorGroupLabel.textContent = 'سحب سداد من';
                if (debtorSelect && debtorSelect.options.length > 0) {
                    debtorSelect.options[0].textContent = 'اختر الشخص المسحوب منه رصيد سداد...';
                }
                if (withdrawalReasonInput) {
                    withdrawalReasonInput.placeholder = 'أدخل سبب سحب سداد (إجباري)...';
                }
                if (btnRecordWithdrawal) {
                    btnRecordWithdrawal.innerHTML = '<i class="fas fa-minus-circle"></i> تسجيل سحب سداد';
                }
                if (amountLabel) amountLabel.textContent = 'القيمة المسحوبة (د.ل)';
            } else if (wVal.toUpperCase() === 'USDT' || wVal.toUpperCase().includes('USDT')) {
                if (debtorGroupLabel) debtorGroupLabel.textContent = 'سحب USDT من';
                if (debtorSelect && debtorSelect.options.length > 0) {
                    debtorSelect.options[0].textContent = 'اختر الشخص المسحوب منه USDT...';
                }
                if (withdrawalReasonInput) {
                    withdrawalReasonInput.placeholder = 'أدخل سبب سحب USDT (إجباري)...';
                }
                if (btnRecordWithdrawal) {
                    btnRecordWithdrawal.innerHTML = '<i class="fas fa-minus-circle"></i> تسجيل سحب USDT';
                }
                if (amountLabel) amountLabel.textContent = 'القيمة المسحوبة ($)';
            } else {
                if (debtorGroupLabel) debtorGroupLabel.textContent = 'سحب رصيد من';
                if (debtorSelect && debtorSelect.options.length > 0) {
                    debtorSelect.options[0].textContent = 'اختر الشخص المسحوب منه الرصيد...';
                }
                if (withdrawalReasonInput) {
                    withdrawalReasonInput.placeholder = 'أدخل سبب السحب (إجباري)...';
                }
                if (btnRecordWithdrawal) {
                    btnRecordWithdrawal.innerHTML = '<i class="fas fa-minus-circle"></i> تسجيل السحب';
                }
                if (amountLabel) amountLabel.textContent = 'القيمة المسحوبة (د.ل)';
            }

            if (isCurrentStaffIbrahim() && (wVal.includes('مصرف') || wVal === 'سداد' || wVal.toUpperCase().includes('USDT'))) {
                if (debtorSelect && (!debtorSelect.value || debtorSelect.selectedIndex <= 0)) {
                    for (let i = 0; i < debtorSelect.options.length; i++) {
                        const optT = debtorSelect.options[i].textContent || debtorSelect.options[i].value;
                        if (optT.includes('ابراهيم') || optT.includes('حسابي')) {
                            debtorSelect.selectedIndex = i;
                            break;
                        }
                    }
                }
            }
        }
        window.updateWithdrawalFormLabels = updateWithdrawalFormLabels;

        walletSelect.addEventListener('change', () => {
            amountInput.dispatchEvent(new Event('input'));
            updateWithdrawalFormLabels();
        });

        amountInput.addEventListener('input', () => {
            const val = parseFloat(amountInput.value) || 0;
            if (walletSelect.value === 'ليبيانا' || walletSelect.value === 'المدار') {
                const convFactor = (window.currentStaffRules && window.currentStaffRules.transfers && !isNaN(window.currentStaffRules.transfers.debtCreditFactor))
                    ? Number(window.currentStaffRules.transfers.debtCreditFactor)
                    : 0.75;
                const cash = val * convFactor;
                calcText.textContent = `(الكاش الفعلي المحسوب: ${cash.toFixed(2)} د.ل)`;
                calcText.classList.remove('hidden-group');
            } else {
                calcText.classList.add('hidden-group');
            }
        });

        // تعبئة قوائم المناديب ديناميكياً (المسحوب منه + مستلم الرصيد)
        async function populateStaffDropdowns() {
            try {
                // جلب المناديب من مجموعة customers
                const snapshot = await db.collection('customers').where('role', '==', 'staff').get();
                let debtorPlaceholder = (walletSelect && walletSelect.value === 'كاش') ? 'اختر الشخص المسحوب منه الكاش...' : 'اختر الشخص المسحوب منه الرصيد...';
                let debtorHtml = `<option value="" selected>${debtorPlaceholder}</option>`;
                let recipientHtml = '<option value="" selected>اختر لمن الرصيد...</option>';
                let splitRecHtml = '<option value="" selected>اختر المندوب...</option>';

                snapshot.forEach(doc => {
                    const data = doc.data();
                    const name = data.firstName ? data.firstName.trim() : (data.name ? data.name.trim().split(' ')[0] : 'مندوب');
                    if (name) {
                        const isMe = (doc.id === uid);
                        debtorHtml += `<option value="${name}">${name}${isMe ? ' (حسابي)' : ''}</option>`;
                        recipientHtml += `<option value="${doc.id}">${name}${isMe ? ' (حسابي)' : ''}</option>`;
                        splitRecHtml += `<option value="${doc.id}">${name}${isMe ? ' (حسابي)' : ''}</option>`;
                    }
                });

                if (debtorSelect) debtorSelect.innerHTML = debtorHtml;
                if (saleRecipientSelect) saleRecipientSelect.innerHTML = recipientHtml;
                if (splitLibyanaRecipientSelect) splitLibyanaRecipientSelect.innerHTML = splitRecHtml;
                if (splitAlmadarRecipientSelect) splitAlmadarRecipientSelect.innerHTML = splitRecHtml;
                updateWithdrawalWalletOptions();
            } catch (err) {
                console.error("Error fetching staff names:", err);
                if (debtorSelect) debtorSelect.innerHTML = '<option value="" selected>اختر الشخص المسحوب منه الرصيد...</option><option value="الأدمن">الأدمن (المدير)</option>';
                updateWithdrawalWalletOptions();
            }
        }
        populateStaffDropdowns();
        updateWithdrawalWalletOptions();

        function resetWithdrawalForm() {
            if (amountInput) amountInput.value = '';
            if (walletSelect) {
                walletSelect.selectedIndex = 0;
                walletSelect.value = '';
            }
            if (debtorSelect) {
                debtorSelect.selectedIndex = 0;
                debtorSelect.value = '';
            }
            if (withdrawalReasonInput) {
                withdrawalReasonInput.value = '';
            }
            if (calcText) {
                calcText.textContent = '(الكاش الفعلي المحسوب: 0 د.ل)';
                calcText.classList.add('hidden-group');
            }
            updateWithdrawalFormLabels();
        }

        // --- تسجيل السحب ---
        btnRecordWithdrawal.addEventListener('click', async () => {
            if (btnRecordWithdrawal && btnRecordWithdrawal.disabled) return;

            const amount = parseFloat(document.getElementById('withdrawalAmount').value);
            const wallet = document.getElementById('withdrawalWallet').value;
            const targetName = document.getElementById('debtorName').value;
            const reason = (document.getElementById('withdrawalReason') ? document.getElementById('withdrawalReason').value : '').trim();

            if (!wallet) {
                if (typeof showToast === 'function') showToast('الرجاء اختيار المحفظة المسحوب منها', 'error');
                return;
            }

            // التحقق من صلاحية المحفظة (المصرفي وسداد و USDT لمندوب ابراهيم فقط)
            if (!isCurrentStaffIbrahim() && (wallet === 'حساب المصرفي' || wallet.includes('مصرف') || wallet === 'سداد' || wallet.toUpperCase() === 'USDT')) {
                if (typeof showToast === 'function') showToast('هذه المحفظة مخصصة للمندوب ابراهيم فقط', 'error');
                return;
            }

            if (!targetName) {
                let msg = 'الرجاء اختيار الشخص المسحوب منه الرصيد';
                if (wallet === 'كاش') msg = 'الرجاء اختيار الشخص المسحوب منه الكاش';
                else if (wallet === 'حساب المصرفي' || wallet.includes('مصرف')) msg = 'الرجاء اختيار الشخص المسحوب منه السحب المصرفي';
                else if (wallet === 'سداد') msg = 'الرجاء اختيار الشخص المسحوب منه رصيد سداد';
                else if (wallet.toUpperCase() === 'USDT') msg = 'الرجاء اختيار الشخص المسحوب منه USDT';
                if (typeof showToast === 'function') showToast(msg, 'error');
                return;
            }
            if (!reason) {
                if (typeof showToast === 'function') showToast('الرجاء كتابة سبب السحب (إجباري)', 'error');
                if (withdrawalReasonInput) withdrawalReasonInput.focus();
                return;
            }

            if (isNaN(amount) || amount <= 0) {
                if (typeof showToast === 'function') showToast('يرجى إدخال القيمة بشكل صحيح', 'error');
                return;
            }

            const currentStaffId = window.currentActiveStaffUid || ((auth.currentUser && auth.currentUser.uid) ? auth.currentUser.uid : uid);
            let dataToSave = {
                staffId: currentStaffId,
                wallet: String(wallet),
                reason: String(reason),
                debtor: String(targetName),
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };

            // تحديد نوع العملية تلقائياً بناءً على المحفظة
            if (wallet === 'ليبيانا' || wallet === 'المدار') {
                const convFactor = (window.currentStaffRules && window.currentStaffRules.transfers && !isNaN(window.currentStaffRules.transfers.debtCreditFactor))
                    ? Number(window.currentStaffRules.transfers.debtCreditFactor)
                    : 0.75;
                dataToSave.type = 'debt_transfer';
                dataToSave.originalCredit = Number(amount) || 0;
                dataToSave.amount = (Number(amount) || 0) * convFactor;
            } else { // كاش، حساب المصرفي، سداد، USDT
                dataToSave.type = 'withdrawal';
                dataToSave.amount = Number(amount) || 0;
            }

            try {
                if (btnRecordWithdrawal) {
                    btnRecordWithdrawal.disabled = true;
                    btnRecordWithdrawal.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التسجيل...';
                }

                await db.collection('transactions').add(dataToSave);

                if (typeof logActivity === 'function') {
                    let actTitle = 'تسجيل سحب رصيد: ';
                    if (wallet === 'كاش') actTitle = 'تسجيل سحب كاش: ';
                    else if (wallet === 'حساب المصرفي' || wallet.includes('مصرف')) actTitle = 'تسجيل سحب مصرفي: ';
                    else if (wallet === 'سداد') actTitle = 'تسجيل سحب سداد: ';
                    else if (wallet.toUpperCase() === 'USDT') actTitle = 'تسجيل سحب USDT: ';

                    logActivity({
                        action: 'staff_withdrawal',
                        category: 'sales',
                        severity: 'warning',
                        title: actTitle + (dataToSave.amount || 0) + (wallet.toUpperCase() === 'USDT' ? ' $' : ' د.ل'),
                        details: { amount: dataToSave.amount, reason: dataToSave.reason, debtor: dataToSave.debtor, wallet: dataToSave.wallet }
                    });
                }

                if (typeof showToast === 'function') showToast('تم التسجيل بنجاح', 'success');
                resetWithdrawalForm();
            } catch (err) {
                console.error('Error recording withdrawal:', err);
                if (typeof showToast === 'function') showToast('حدث خطأ أثناء تسجيل السحب: ' + (err.message || ''), 'error');
            } finally {
                if (btnRecordWithdrawal) {
                    btnRecordWithdrawal.disabled = false;
                    updateWithdrawalFormLabels();
                }
            }
        });
    } // نهاية setupForms

    // =============================================
    // 5. تصدير وتنزيل سجل عمليات المندوب كصورة
    // =============================================
    function setupImageExportListener() {
        const btnDownload = document.getElementById('btnDownloadLogImage');
        if (!btnDownload) return;

        // منع تكرار ربط المستمع
        if (btnDownload.dataset.listenerAttached) return;
        btnDownload.dataset.listenerAttached = 'true';

        btnDownload.addEventListener('click', async () => {
            if (typeof html2canvas === 'undefined') {
                if (typeof showToast === 'function') {
                    showToast('جاري تحميل مكتبة معالجة الصور، يرجى المحاولة بعد لحظات...', 'info');
                } else {
                    showAlert('جاري تحميل مكتبة معالجة الصور...');
                }
                return;
            }

            try {
                btnDownload.disabled = true;
                btnDownload.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري إنشاء الصورة...';

                // 1. استخراج اسم المندوب
                let staffName = 'مندوب';
                const staffCardNameEl = document.getElementById('staffCardName');
                if (staffCardNameEl) {
                    const extracted = staffCardNameEl.textContent.replace(/جاري التحميل\.\.\./g, '').trim();
                    if (extracted) staffName = extracted;
                }

                // 2. استخراج التاريخ والوقت
                const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
                const now = new Date();
                const dayName = days[now.getDay()];
                const dateStr = now.toLocaleDateString('en-GB'); // DD/MM/YYYY
                const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

                let periodHeaderHtml = `📅 اليوم: ${dayName} (${dateStr})`;
                if (activeFilterStartDate && activeFilterEndDate) {
                    if (activeFilterStartDate.toDateString() === activeFilterEndDate.toDateString()) {
                        const fDay = days[activeFilterStartDate.getDay()];
                        const fDate = activeFilterStartDate.toLocaleDateString('en-GB');
                        periodHeaderHtml = `📅 اليوم: ${fDay} (${fDate})`;
                    } else {
                        const sDate = activeFilterStartDate.toLocaleDateString('en-GB');
                        const eDate = activeFilterEndDate.toLocaleDateString('en-GB');
                        periodHeaderHtml = `📅 الفترة: من ${sDate} إلى ${eDate}`;
                    }
                }

                // 3. استخراج الأرصدة المطلوبة
                const getAmountText = (id) => {
                    const el = document.getElementById(id);
                    if (!el) return '0.00';
                    const txt = el.textContent.replace(/[^\d.-]/g, '').trim();
                    return txt ? parseFloat(txt).toFixed(2) : '0.00';
                };

                const libyanaAmt = getAmountText('libyanaBalance');
                const almadarAmt = getAmountText('almadarBalance');
                const cashAmt = getAmountText('cashBalance');
                const profitAmt = getAmountText('staffTodayProfit');

                // 4. استخراج سطور العمليات من الجدول
                const tbody = document.getElementById('staffHistoryTableBody');
                const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
                let tableRowsHtml = '';
                let validRowCount = 0;

                const isEmpty = !rows.length || (rows.length === 1 && rows[0].querySelector('.table-empty-message'));

                if (isEmpty) {
                    tableRowsHtml = `
                        <tr>
                            <td colspan="5" style="text-align: center; padding: 25px; color: #8b949e; font-size: 1rem; background: rgba(255,255,255,0.02);">
                                لا توجد عمليات مسجلة في هذا اليوم
                            </td>
                        </tr>
                    `;
                } else {
                    rows.forEach((row, idx) => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 5) {
                            validRowCount++;
                            const timeCell = cells[0].innerHTML;
                            const typeCell = cells[1].innerHTML;
                            const prodCell = cells[2].innerHTML;
                            const priceCell = cells[3].innerHTML;
                            const methodCell = cells[4].innerHTML;

                            const rowBg = (idx % 2 === 0) ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)';

                            tableRowsHtml += `
                                <tr style="background: ${rowBg}; border-bottom: 1px solid rgba(255,255,255,0.06);">
                                    <td style="padding: 12px 10px; text-align: center; color: #c9d1d9; font-size: 0.95rem;">${timeCell}</td>
                                    <td style="padding: 12px 10px; text-align: center;">${typeCell}</td>
                                    <td style="padding: 12px 12px; text-align: right; color: #f0f6fc; font-weight: 500; font-size: 0.95rem;">${prodCell}</td>
                                    <td style="padding: 12px 10px; text-align: center; color: #58a6ff; font-weight: bold; font-size: 1rem;" dir="ltr">${priceCell} د.ل</td>
                                    <td style="padding: 12px 10px; text-align: center; color: #e6edf3; font-size: 0.95rem;">${methodCell}</td>
                                </tr>
                            `;
                        }
                    });
                }

                // 5. بناء كرت التقرير عالي الجودة
                const reportWrapper = document.createElement('div');
                reportWrapper.id = 'staff-export-snapshot-container';
                reportWrapper.style.cssText = `
                    position: fixed;
                    left: -9999px;
                    top: 0;
                    width: 880px;
                    background: linear-gradient(145deg, #0c1017 0%, #151a23 100%);
                    border: 2px solid rgba(76, 175, 80, 0.4);
                    border-radius: 20px;
                    padding: 30px;
                    color: #f0f6fc;
                    font-family: 'Tajawal', sans-serif;
                    letter-spacing: normal !important;
                    direction: rtl;
                    text-align: right;
                    box-sizing: border-box;
                    z-index: -9999;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.8);
                `;

                reportWrapper.innerHTML = `
                    <!-- Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid rgba(255, 255, 255, 0.1); padding-bottom: 20px; margin-bottom: 22px;">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <img src="photo/logo.ico" style="width: 55px; height: 55px; border-radius: 12px; box-shadow: 0 4px 15px rgba(76,175,80,0.35);" crossorigin="anonymous" onerror="this.style.display='none'">
                            <div>
                                <h1 style="margin: 0; font-size: 1.4rem; color: #ffffff; font-weight: 800; letter-spacing: normal; display: flex; align-items: center; gap: 8px;">
                                    <span>سيرفرات الميزو</span>
                                    <span style="color: #4caf50;">-</span>
                                    <span dir="ltr" style="font-family: Arial, sans-serif; font-weight: 800;">ALmEz0</span>
                                </h1>
                                <p style="margin: 4px 0 0 0; font-size: 0.9rem; color: #8b949e; letter-spacing: normal;">لوحة تقارير وسجل عمليات المندوب</p>
                            </div>
                        </div>
                        <div style="text-align: left; background: rgba(76, 175, 80, 0.12); border: 1px solid rgba(76, 175, 80, 0.4); border-radius: 12px; padding: 10px 20px;">
                            <div style="font-size: 1.1rem; font-weight: 700; color: #4caf50; letter-spacing: normal;">👤 المندوب: ${staffName}</div>
                            <div style="font-size: 0.85rem; color: #cbd5e1; margin-top: 3px; letter-spacing: normal;">${periodHeaderHtml}</div>
                        </div>
                    </div>

                    <!-- Balances Cards (الأرصدة المطلوبة) -->
                    <div style="margin-bottom: 25px;">
                        <div style="font-size: 1.05rem; font-weight: 700; color: #58a6ff; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; letter-spacing: normal;">
                            <span>💰 الأرصدة المطلوبة والأرباح</span>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
                            <!-- Libyana -->
                            <div style="background: rgba(168, 85, 247, 0.08); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 12px; padding: 14px 10px; text-align: center;">
                                <div style="color: #c084fc; font-size: 0.9rem; font-weight: 600; margin-bottom: 6px; letter-spacing: normal;">مطلوب ليبيانا</div>
                                <div style="color: #a855f7; font-size: 1.3rem; font-weight: 800;" dir="ltr">${libyanaAmt} <span style="font-size: 0.75rem;">د.ل</span></div>
                            </div>
                            <!-- Almadar -->
                            <div style="background: rgba(76, 175, 80, 0.08); border: 1px solid rgba(76, 175, 80, 0.35); border-radius: 12px; padding: 14px 10px; text-align: center;">
                                <div style="color: #81c784; font-size: 0.9rem; font-weight: 600; margin-bottom: 6px; letter-spacing: normal;">مطلوب المدار</div>
                                <div style="color: #4caf50; font-size: 1.3rem; font-weight: 800;" dir="ltr">${almadarAmt} <span style="font-size: 0.75rem;">د.ل</span></div>
                            </div>
                            <!-- Cash -->
                            <div style="background: rgba(229, 57, 53, 0.08); border: 1px solid rgba(229, 57, 53, 0.35); border-radius: 12px; padding: 14px 10px; text-align: center;">
                                <div style="color: #e57373; font-size: 0.9rem; font-weight: 600; margin-bottom: 6px; letter-spacing: normal;">مطلوب كاش</div>
                                <div style="color: #e53935; font-size: 1.3rem; font-weight: 800;" dir="ltr">${cashAmt} <span style="font-size: 0.75rem;">د.ل</span></div>
                            </div>
                            <!-- Today Profit -->
                            <div style="background: rgba(255, 179, 0, 0.08); border: 1px solid rgba(255, 179, 0, 0.35); border-radius: 12px; padding: 14px 10px; text-align: center;">
                                <div style="color: #ffca28; font-size: 0.9rem; font-weight: 600; margin-bottom: 6px; letter-spacing: normal;">${(activeFilterStartDate && activeFilterEndDate && activeFilterStartDate.toDateString() !== activeFilterEndDate.toDateString()) ? 'أرباح المبيعات للفترة' : 'أرباح المبيعات لليوم'}</div>
                                <div style="color: #ffb300; font-size: 1.3rem; font-weight: 800;" dir="ltr">${profitAmt} <span style="font-size: 0.75rem;">د.ل</span></div>
                            </div>
                        </div>
                    </div>

                    <!-- Operations Table Header -->
                    <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-size: 1.05rem; font-weight: 700; color: #58a6ff; letter-spacing: normal;">
                            <span>📋 سجل العمليات اليومية (${validRowCount} عملية)</span>
                        </div>
                    </div>

                    <!-- Operations Table -->
                    <table style="width: 100%; border-collapse: collapse; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 22px;">
                        <thead>
                            <tr style="background: rgba(26, 31, 42, 0.95); border-bottom: 2px solid rgba(255,255,255,0.15);">
                                <th style="padding: 12px 10px; text-align: center; color: #94a3b8; font-size: 0.9rem; font-weight: 700; width: 15%; letter-spacing: normal;">الوقت</th>
                                <th style="padding: 12px 10px; text-align: center; color: #94a3b8; font-size: 0.9rem; font-weight: 700; width: 16%; letter-spacing: normal;">نوع العملية</th>
                                <th style="padding: 12px 12px; text-align: right; color: #94a3b8; font-size: 0.9rem; font-weight: 700; width: 34%; letter-spacing: normal;">المنتج / السبب</th>
                                <th style="padding: 12px 10px; text-align: center; color: #94a3b8; font-size: 0.9rem; font-weight: 700; width: 17%; letter-spacing: normal;">القيمة (د.ل)</th>
                                <th style="padding: 12px 10px; text-align: center; color: #94a3b8; font-size: 0.9rem; font-weight: 700; width: 18%; letter-spacing: normal;">المحفظة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>

                    <!-- Footer -->
                    <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px; font-size: 0.82rem; color: #94a3b8;">
                        <div style="letter-spacing: normal;">تم الاستخراج في: <span dir="ltr">${timeStr}</span> - ${dateStr}</div>
                        <div style="letter-spacing: normal;">سيرفرات الميزو - <span dir="ltr">ALmEz0</span> © 2026</div>
                    </div>
                `;

                document.body.appendChild(reportWrapper);

                // الانتظار للتأكد من تحميل الخطوط والصور بالكامل
                if (document.fonts) {
                    await document.fonts.ready;
                }
                await new Promise(resolve => setTimeout(resolve, 200));

                const canvas = await html2canvas(reportWrapper, {
                    scale: 2, // دقة مضاعفة فائقة الوضوح
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#0c1017',
                    logging: false
                });

                document.body.removeChild(reportWrapper);

                // تحميل الصورة
                const link = document.createElement('a');
                const cleanName = staffName.replace(/[^\u0600-\u06FF\w\-]/g, '_');
                const cleanDate = dateStr.replace(/\//g, '-');
                link.download = `سجل_عمليات_${cleanName}_${cleanDate}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();

                if (typeof showToast === 'function') {
                    showToast('تم تنزيل صورة سجل العمليات بنجاح', 'success');
                }
            } catch (err) {
                console.error('Error exporting log image:', err);
                if (typeof showToast === 'function') {
                    showToast('حدث خطأ أثناء إنشاء الصورة، يرجى المحاولة مرة أخرى', 'error');
                } else {
                    showAlert('حدث خطأ أثناء إنشاء الصورة');
                }
            } finally {
                btnDownload.disabled = false;
                btnDownload.innerHTML = '<i class="fas fa-camera"></i> تنزيل السجل كصورة';
            }
        });
    }

}); // نهاية document.addEventListener('DOMContentLoaded')

// =============================================
// تهيئة مكتبة Flatpickr لاختيار التواريخ بشكل أنيق
// =============================================
function initStaffFlatpickr() {
    if (typeof flatpickr !== 'undefined') {
        const flatpickrConfig = {
            dateFormat: "Y-m-d", // الصيغة الفعلية للكود
            altInput: true,      // إنشاء حقل واجهة للعرض فقط
            altFormat: "d/m/Y",  // الصيغة التي يراها المستخدم (dd/mm/yyyy)
            allowInput: true,    // السماح بالكتابة اليدوية إذا أراد المستخدم
            disableMobile: true  // إجبار ظهور صيغة dd/mm/yyyy على الهواتف النقالة ومنع التحويل للنمط الافتراضي
        };

        flatpickr("#historyStartDate", flatpickrConfig);
        flatpickr("#historyEndDate", flatpickrConfig);
    }
}
document.addEventListener("DOMContentLoaded", initStaffFlatpickr);
if (document.readyState === "complete" || document.readyState === "interactive") {
    initStaffFlatpickr();
}

// =============================================
// دالة إلغاء العملية المتاحة عالمياً
// =============================================
window.deleteTransaction = async function (transactionId) {
    const isConfirmed = await showConfirm('هل أنت متأكد من إلغاء هذه العملية؟');
    if (isConfirmed) {
        try {
            // احصل على بيانات العملية قبل حذفها لتحديث المخزون
            const transDoc = await db.collection('transactions').doc(transactionId).get();
            const transData = transDoc.exists ? transDoc.data() : null;
            await db.collection('transactions').doc(transactionId).delete();
            if (transData && typeof transData.product === 'string') {
                // حساب اسم الصنف في المخزن وفقًا للمنطق المستخدم أثناء البيع
                let inventoryItemName = String(transData.product);
                const cat = transData.category || '';
                if (cat === 'smartApps' || cat === 'smart') {
                    const appName = String(transData.product).trim().toLowerCase();
                    const iboOneApps = ['ibo one', 'iboplayer3', 'duplex pro', 'kemet tv'];
                    inventoryItemName = iboOneApps.some(app => appName.includes(app)) ? 'ibo-one' : 'ibo-bob';
                } else if (cat === 'vip') {
                    inventoryItemName = 'باقات VIP';
                }
                // إرجاع المخزون بناءً على عدد النقاط المخصومة في العملية
                const pointsToReturn = Number(transData.inventoryPointsDeducted) || 0;
                if (pointsToReturn > 0) {
                    await db.collection('inventory').doc(inventoryItemName).set({
                        count: firebase.firestore.FieldValue.increment(pointsToReturn),
                        category: cat,
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }
            }

            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'staff_cancel_sale',
                    category: 'sales',
                    severity: 'warning',
                    title: 'إلغاء عملية بيع: ' + (transData && transData.product ? transData.product : transactionId),
                    details: {
                        transactionId: transactionId,
                        product: transData ? transData.product : '',
                        duration: transData ? transData.duration : '',
                        method: transData ? transData.method : '',
                        price: transData ? transData.price : ''
                    }
                });
            }

            if (typeof showToast === 'function') showToast('تم إلغاء العملية بنجاح', 'success');
        } catch (error) {
            console.error("Error deleting transaction: ", error);
            if (typeof showToast === 'function') showToast('حدث خطأ أثناء إلغاء العملية', 'error');
        }
    }
};


// =============================================
// عرض المخزون للمناديب (للقراءة فقط وتتحدث لحظياً)
// =============================================
window.listenToStaffInventory = function () {
    const grid = document.getElementById('staffInventoryGrid');
    if (!grid) return;

    let staffInventoryDocs = [];
    let customOrder = [];

    try {
        const cached = localStorage.getItem('almezo_inventory_order');
        if (cached) customOrder = JSON.parse(cached);
    } catch (e) {}

    function renderStaffInventory() {
        if (!staffInventoryDocs.length) {
            grid.innerHTML = '<div style="width: 100%; text-align:center; color: var(--text-secondary);">لا توجد أصناف في المخزن حالياً</div>';
            return;
        }

        const sorted = [...staffInventoryDocs].sort((a, b) => {
            const idxA = customOrder.indexOf(a.id);
            const idxB = customOrder.indexOf(b.id);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.id.localeCompare(b.id, 'ar');
        });

        let html = '';
        sorted.forEach(item => {
            const count = item.data.count || 0;
            let colorClass = count > 5 ? '#4caf50' : (count > 0 ? '#ff9800' : '#f44336');
            html += `
                <div>
                    <h4 style="margin: 0 0 10px 0; font-size: 0.95rem; color: var(--blue-accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.id}">${item.id}</h4>
                    <div style="font-size: 1.8rem; font-weight: bold; color: ${colorClass}; margin-bottom: 5px;" dir="ltr">${count}</div>
                </div>
            `;
        });
        grid.innerHTML = html;
    }

    if (typeof db !== 'undefined') {
        // الاستماع لترتيب المدير المخصص
        db.collection('siteConfig').doc('inventoryOrder').onSnapshot(doc => {
            if (doc.exists && Array.isArray(doc.data().order)) {
                customOrder = doc.data().order;
                try { localStorage.setItem('almezo_inventory_order', JSON.stringify(customOrder)); } catch (e) {}
                renderStaffInventory();
            }
        }, err => console.warn('Staff inventory order listener warning:', err));

        // الاستماع لأصناف المخزن
        db.collection('inventory').onSnapshot(snapshot => {
            if (snapshot.empty) {
                staffInventoryDocs = [];
                renderStaffInventory();
                return;
            }
            staffInventoryDocs = [];
            snapshot.forEach(doc => staffInventoryDocs.push({ id: doc.id, data: doc.data() }));
            renderStaffInventory();
        }, err => {
            console.warn('Error fetching inventory for staff:', err);
        });
    }
};

// =============================================
// الاستماع لتغييرات قوانين ونسب المناديب وتحديث الواجهة لحظياً
// =============================================
window.addEventListener('staffRulesChanged', () => {
    if (typeof window.recalculateWeeklyProfit === 'function') {
        window.recalculateWeeklyProfit();
    } else if (typeof window.reprocessStaffBalances === 'function') {
        window.reprocessStaffBalances();
    }
    if (typeof renderStaffHistory === 'function') {
        renderStaffHistory();
    }
});