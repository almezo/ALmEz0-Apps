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
        if (!profile || (profile.role !== 'staff' && profile.role !== 'admin')) {
            // ليس مندوباً أو مديراً، إعادة توجيه
            window.location.replace('index.html');
            return;
        }
        
        // إظهار المحتوى للمندوب/المدير
        staffMainContent.style.display = 'block';
        
        // بدء العمليات الأساسية للوحة
        fetchProducts();
        setupBalancesListener(firebaseUser.uid, profile.name || 'مندوب');
        setupHistoryListener(firebaseUser.uid);
        setupForms(firebaseUser.uid);
    });
    
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
            if (duration.includes('3')) pool = 7.5;
            else if (duration.includes('6')) pool = 12;
            else if (duration.includes('12') || duration.includes('سنة')) pool = 15;
        } else if (cat === 'smartApps' || cat === 'smart') {
            if (duration.includes('12') || duration.includes('سنة')) pool = 7.5;
            else if (duration.includes('مدى') || duration.toLowerCase().includes('life')) pool = 15;
        } else if (cat === 'vip') {
            pool = 7.5;
        }
        return pool;
    }

    function setupBalancesListener(uid, staffName) {
        // تحديث اسم المندوب في صندوق الأرباح
        const firstName = staffName.split(' ')[0];
        const staffFirstNameEl = document.getElementById('staffFirstName');
        if (staffFirstNameEl) staffFirstNameEl.textContent = firstName;

        let myDocs = [];
        let givenDocs = [];
        let staffData = {};
        let givenDocsUnsubscribe = null;
        let globalWeeklyProfit = 0;
        let currentCashTotal = 0;
        let currentStaffName = staffName;
        
        // تم حذف حساب الصافي المكرر بناءً على الأمر بأن تعكس النتائج تماماً من المدير
        function updateNetProfitUI() {
            // لا تفعل شيئاً هنا، التحديث يتم في processBalances مباشرة
        }

        function processBalances() {
            let libyanaSales = 0, libyanaWithdrawals = 0;
            let almadarSales = 0, almadarWithdrawals = 0;
            let cashSales = 0, cashWithdrawals = 0;
            
            let todayLibyanaSales = 0, todayLibyanaWithdrawals = 0;
            let todayAlmadarSales = 0, todayAlmadarWithdrawals = 0;
            let todayCashSales = 0, todayCashWithdrawals = 0;
            let todayTotalProfit = 0;
            let cumulativeDebtCredit = 0;
            let cumulativeDebtCash = 0;
            
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            
            // 1. حساب العمليات كمستلم (Taker)
            myDocs.forEach(doc => {
                const data = doc.data();
                const isToday = !data.timestamp || (data.timestamp.toDate().getTime() >= startOfDay);
                
                if (data.type === 'sale') {
                    const price = parseFloat(data.price) || 0;
                    if (data.method === 'ليبيانا') {
                        libyanaSales += price;
                        if (isToday) todayLibyanaSales += price;
                    }
                    if (data.method === 'المدار') {
                        almadarSales += price;
                        if (isToday) todayAlmadarSales += price;
                    }
                    if (data.method === 'كاش' || data.method === 'دين') {
                        cashSales += price;
                        if (isToday) todayCashSales += price;
                    }
                    if (isToday) {
                        let pool = 0;
                        if (data.points !== undefined && data.points !== null) {
                            pool = Number(data.points) || 0;
                        } else {
                            pool = calculateTotalCommission(data.product, data.duration);
                        }
                        todayTotalProfit += pool;
                    }
                } else if (data.type === 'withdrawal') {
                    const amt = parseFloat(data.amount) || 0;
                    if (data.wallet === 'ليبيانا') {
                        libyanaWithdrawals += amt;
                        if (isToday) todayLibyanaWithdrawals += amt;
                    }
                    if (data.wallet === 'المدار') {
                        almadarWithdrawals += amt;
                        if (isToday) todayAlmadarWithdrawals += amt;
                    }
                    if (data.wallet === 'كاش') {
                        cashWithdrawals += amt;
                        if (isToday) todayCashWithdrawals += amt;
                    }
                } else if (data.type === 'debt_transfer') {
                    // كمستلم: الكاش يزيد (مطلوب كاش) فقط
                    const amtCash = parseFloat(data.amount) || 0;
                    const amtCredit = parseFloat(data.originalCredit) || 0;
                    
                    if (data.wallet === 'ليبيانا') {
                        cashSales += amtCash;
                        if (isToday) {
                            todayCashSales += amtCash;
                        }
                    }
                    if (data.wallet === 'المدار') {
                        cashSales += amtCash;
                        if (isToday) {
                            todayCashSales += amtCash;
                        }
                    }
                    cumulativeDebtCash += amtCash;
                    cumulativeDebtCredit += amtCredit;
                }
            });

            // 2. حساب العمليات كمعطي (Giver)
            givenDocs.forEach(doc => {
                const data = doc.data();
            
            if (staffNameStr.includes('ابراهيم')) {
                calculatedNetProfit = globalWeeklyProfit - cashTotal;
            } else if (staffNameStr.includes('اسلام') || staffNameStr.includes('ايوب') || staffNameStr.includes('اسامه')) {
                calculatedNetProfit = (globalWeeklyProfit / 3) - cashTotal;
            } else {
                calculatedNetProfit = parseFloat(staffData.currentNetProfit) || 0;
            }
            
            const netProfit = calculatedNetProfit + baseProfit;
            
            if (document.getElementById('libyanaBalance')) document.getElementById('libyanaBalance').innerHTML = `<span dir="ltr" style="display: inline-block;">${libyanaTotal.toFixed(2)}</span> <span style="font-size: 0.7rem;">د.ل</span>`;
            if (document.getElementById('almadarBalance')) document.getElementById('almadarBalance').innerHTML = `<span dir="ltr" style="display: inline-block;">${almadarTotal.toFixed(2)}</span> <span style="font-size: 0.7rem;">د.ل</span>`;
            if (document.getElementById('cashBalance')) document.getElementById('cashBalance').innerHTML = `<span dir="ltr" style="display: inline-block;">${cashTotal.toFixed(2)}</span> <span style="font-size: 0.7rem;">د.ل</span>`;
            
            const profitEl = document.querySelector('#profitBalance .card-profit-amount');
            if (profitEl) {
                profitEl.textContent = netProfit.toFixed(2);
            }
            
            if (document.getElementById('staffTodayProfit')) {
                document.getElementById('staffTodayProfit').innerHTML = `${todayTotalProfit.toFixed(2)} <span style="font-size: 1rem;">د.ل</span>`;
            }
            
            if (document.getElementById('cumulativeDebtCredit')) {
                document.getElementById('cumulativeDebtCredit').innerHTML = `${cumulativeDebtCredit.toFixed(2)} <span style="font-size: 1rem;">د.ل</span>`;
            }
            if (document.getElementById('cumulativeDebtCash')) {
                document.getElementById('cumulativeDebtCash').innerHTML = `${cumulativeDebtCash.toFixed(2)} <span style="font-size: 1rem;">د.ل</span>`;
            }
        }

        // الاستماع الحي لبيانات المندوب (للحصول على الأرصدة الأساسية وتحديثها فورياً)
        db.collection('customers').doc(uid).onSnapshot(doc => {
            if (doc.exists) {
                staffData = doc.data();
                
                const nameToDisplay = staffData.firstName ? (staffData.firstName + ' ' + (staffData.lastName || '')).trim() : (staffData.name || staffName || 'مندوب غير معروف');
                currentStaffName = nameToDisplay;
                
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
                
                // الاستماع لعمليات سحب الرصيد (كمعطي) بالاسم الصحيح والمطابق للمدير
                if (givenDocsUnsubscribe) givenDocsUnsubscribe();
                givenDocsUnsubscribe = db.collection('transactions').where('debtor', '==', nameToDisplay).onSnapshot(snapshot => {
                    givenDocs = snapshot.docs;
                    processBalances();
                }, err => {
                    console.error("Error listening to given balances:", err);
                });

                processBalances();
            }
        }, err => {
            console.error("Error listening to staff data:", err);
        });

        db.collection('transactions').where('staffId', '==', uid).onSnapshot(snapshot => {
            myDocs = snapshot.docs;
            processBalances();
        }, err => {
            console.error("Error listening to my balances:", err);
        });
        
        // الاستماع لجميع عمليات الأسبوع الحالي لحساب إجمالي أرباح الشركة
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        const day = d.getDay(); // 0 is Sunday, 6 is Saturday
        const diff = (day === 6) ? 0 : (day + 1);
        d.setDate(d.getDate() - diff);
        
        db.collection('transactions').where('timestamp', '>=', d).onSnapshot(snapshot => {
            let total = 0;
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.type === 'sale') {
                    if (data.points !== undefined && data.points !== null) {
                        total += Number(data.points) || 0;
                    } else if (typeof calculateTotalCommission === 'function') {
                        total += calculateTotalCommission(data.product, data.duration);
                    }
                }
            });
            globalWeeklyProfit = total;
            processBalances(); // إعادة تحديث الواجهة بقيمة الصافي الجديدة
        }, err => {
            console.error("Error listening to global transactions:", err);
        });
    }
    
    // =============================================
    // سجل حركات المندوب (History)
    // =============================================
    function setupHistoryListener(uid) {
        // تحديث عنوان السجل
        const logTitleEl = document.getElementById('salesLogTitle');
        if (logTitleEl) {
            const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
            const now = new Date();
            const dayName = days[now.getDay()];
            const dateStr = now.toLocaleDateString('en-GB');
            logTitleEl.innerHTML = `<i class="fas fa-history"></i> سجل عمليات المندوب (اليوم: ${dayName} ${dateStr})`;
        }

        db.collection('transactions')
          .where('staffId', '==', uid)
          .onSnapshot({ includeMetadataChanges: true }, snapshot => {
              const tbody = document.getElementById('staffHistoryTableBody');
              if (!tbody) return;
              
              if (snapshot.empty) {
                  tbody.innerHTML = '<tr><td colspan="6" class="table-empty-message">لا توجد عمليات مسجلة في هذا اليوم</td></tr>';
                  return;
              }
              
              // معالجة مشكلة ترتيب العمليات المحلية الجديدة التي لا تملك timestamp بعد
              const docs = [...snapshot.docs]; // استخدام نسخة من المصفوفة لمنع تعديل مصفوفة فايربيز الأصلية
              docs.sort((a, b) => {
                  const tA = (a.data().timestamp && typeof a.data().timestamp.toMillis === 'function') ? a.data().timestamp.toMillis() : (a.data().timestamp ? new Date(a.data().timestamp).getTime() : Date.now());
                  const tB = (b.data().timestamp && typeof b.data().timestamp.toMillis === 'function') ? b.data().timestamp.toMillis() : (b.data().timestamp ? new Date(b.data().timestamp).getTime() : Date.now());
                  return tB - tA;
              });
              
              // تحديد بداية اليوم الحالي
              const startOfDay = new Date();
              startOfDay.setHours(0, 0, 0, 0);
              const startOfDayMillis = startOfDay.getTime();
              
              // أخذ أحدث 50 عملية فقط
              const recentDocs = docs.slice(0, 50);
              
              let html = '';
              recentDocs.forEach(doc => {
                  const data = doc.data();
                  
                  // تصفية: استبعاد العمليات التي تمت قبل بداية اليوم
                  const tMillis = (data.timestamp && typeof data.timestamp.toMillis === 'function') ? data.timestamp.toMillis() : (data.timestamp ? new Date(data.timestamp).getTime() : Date.now());
                  if (tMillis < startOfDayMillis) {
                      return; // تخطي هذه العملية لأنها من الأيام السابقة
                  }
                  
                  let dateStr = 'الآن';
                  if (data.timestamp) {
                      const d = (typeof data.timestamp.toDate === 'function') ? data.timestamp.toDate() : new Date(data.timestamp);
                      const formatted = new Intl.DateTimeFormat('en-US', { 
                          hour: '2-digit', minute: '2-digit', hour12: true
                      }).format(d);
                      dateStr = `<span dir="ltr">${formatted}</span>`;
                  }
                  
                  if (data.type === 'sale') {
                      html += `
                        <tr>
                            <td style="text-align: right;">${dateStr}</td>
                            <td><span class="badge badge-sale">مبيعة</span></td>
                            <td>${data.product || ''} ${data.duration ? ' - ' + data.duration : ''}</td>
                            <td>${data.price}</td>
                            <td>${data.method || '-'}</td>
                            <td><button class="btn-delete-trans" onclick="deleteTransaction('${doc.id}')" title="إلغاء العملية"><i class="fas fa-trash"></i></button></td>
                        </tr>
                      `;
                  } else if (data.type === 'withdrawal') {
                      html += `
                        <tr>
                            <td style="text-align: right;">${dateStr}</td>
                            <td><span class="badge badge-withdrawal">سحب رصيد</span></td>
                            <td>${data.reason || ''}</td>
                            <td>${data.amount}</td>
                            <td>${data.wallet || '-'}</td>
                            <td><button class="btn-delete-trans" onclick="deleteTransaction('${doc.id}')" title="إلغاء العملية"><i class="fas fa-trash"></i></button></td>
                        </tr>
                      `;
                  } else if (data.type === 'debt_transfer') {
                      html += `
                        <tr>
                            <td style="text-align: right;">${dateStr}</td>
                            <td><span class="badge" style="background:#ff9800; color:#fff; padding:3px 8px; border-radius:4px; font-size:0.8rem;">تحويل دين</span></td>
                            <td>من: ${data.debtor || ''}</td>
                            <td>${data.originalCredit ? `${data.originalCredit} د.ل <br><span style="font-size:0.8rem; color:#888;">(الصافي: ${data.amount} د.ل)</span>` : data.amount}</td>
                            <td>${data.wallet || '-'}</td>
                            <td><button class="btn-delete-trans" onclick="deleteTransaction('${doc.id}')" title="إلغاء العملية"><i class="fas fa-trash"></i></button></td>
                        </tr>
                      `;
                  }
              });
              
              if (html === '') {
                  tbody.innerHTML = '<tr><td colspan="6" class="table-empty-message">لا توجد عمليات مسجلة في هذا اليوم</td></tr>';
              } else {
                  tbody.innerHTML = html;
              }
          }, err => {
              console.error("Error listening to history:", err);
          });
    }

    // =============================================
    // 4. إعداد وتجهيز النماذج (تسجيل بيع / تسجيل سحب)
    // =============================================
    function setupForms(uid) {
        // --- إدارة قوائم المنتجات والمدة ---
        const selectCategory = document.getElementById('saleProductCategory');
        const selectItemContainer = document.getElementById('saleProductItemContainer');
        const selectItem = document.getElementById('saleProductItem');
        const itemLabel = document.getElementById('saleProductItemLabel');
        const selectDuration = document.getElementById('saleDuration');

        function populateDurations(category, productName) {
            selectDuration.innerHTML = '<option value="" disabled selected>اختر المدة / الباقة...</option>';
            
            if (category === 'iptv') {
                selectDuration.insertAdjacentHTML('beforeend', '<option value="3 أشهر" data-points="7.5">3 أشهر (7.5 د.ل)</option>');
                selectDuration.insertAdjacentHTML('beforeend', '<option value="6 أشهر" data-points="12">6 أشهر (12 د.ل)</option>');
                selectDuration.insertAdjacentHTML('beforeend', '<option value="12 شهر" data-points="15">12 شهر (15 د.ل)</option>');
            } else if (category === 'smartApps' || category === 'smart') {
                selectDuration.insertAdjacentHTML('beforeend', '<option value="سنة واحدة" data-points="7.5">سنة واحدة (7.5 د.ل)</option>');
                selectDuration.insertAdjacentHTML('beforeend', '<option value="مدى الحياة" data-points="15">مدى الحياة (15 د.ل)</option>');
            } else if (category === 'vip') {
                selectDuration.insertAdjacentHTML('beforeend', '<option value="شهر واحد" data-points="7.5">شهر واحد (7.5 د.ل)</option>');
                selectDuration.insertAdjacentHTML('beforeend', '<option value="3 أشهر" data-points="7.5">3 أشهر (7.5 د.ل)</option>');
                selectDuration.insertAdjacentHTML('beforeend', '<option value="6 أشهر" data-points="7.5">6 أشهر (7.5 د.ل)</option>');
                selectDuration.insertAdjacentHTML('beforeend', '<option value="سنة واحدة" data-points="7.5">سنة واحدة (7.5 د.ل)</option>');
            } else {
                selectDuration.innerHTML = '<option value="">اختر المنتج أولاً...</option>';
            }
        }

        selectCategory.addEventListener('change', () => {
            const cat = selectCategory.value;
            selectItem.innerHTML = '<option value="" disabled selected>اختر المنتج...</option>';
            selectDuration.innerHTML = '<option value="">اختر المنتج أولاً...</option>';
            
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

        // --- تسجيل البيع ---
        document.getElementById('btnRecordSale').addEventListener('click', async () => {
            const product = document.getElementById('saleProductItem').value;
            
            const durationSelect = document.getElementById('saleDuration');
            const duration = durationSelect.value;
            let points = durationSelect.selectedIndex > 0 ? Number(durationSelect.options[durationSelect.selectedIndex].dataset.points || 0) : 0;
            
            const price = parseFloat(document.getElementById('salePrice').value);
            const method = document.getElementById('saleMethod').value;
            
            if (method === 'دين') {
                points = 0;
            }
            
            if (!method) {
                if (typeof showToast === 'function') showToast('الرجاء اختيار طريقة الدفع!', 'error');
                else alert('الرجاء اختيار طريقة الدفع!');
                return;
            }
            
            if (!product || !duration || isNaN(price) || price <= 0) {
                if (typeof showToast === 'function') showToast('يرجى اختيار المنتج والمدة وتعبئة السعر', 'error');
                return;
            }
            
            try {
                const btn = document.getElementById('btnRecordSale');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التسجيل...';
                
                await db.collection('transactions').add({
                    type: 'sale',
                    staffId: uid,
                    product: product,
                    duration: duration,
                    points: points,
                    price: price,
                    method: method,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                if (typeof showToast === 'function') showToast('تم تسجيل المبيعة بنجاح', 'success');
                document.getElementById('salePrice').value = '';
                document.getElementById('saleMethod').value = '';
                document.getElementById('saleProductCategory').value = '';
                document.getElementById('saleProductItem').innerHTML = '<option value="" disabled selected>اختر نوع المنتج أولاً...</option>';
                document.getElementById('saleProductItemContainer').classList.add('hidden-group');
                document.getElementById('saleDuration').innerHTML = '<option value="">اختر المنتج أولاً...</option>';
            } catch (err) {
                console.error('Error recording sale:', err);
                if (typeof showToast === 'function') showToast('حدث خطأ أثناء تسجيل المبيعة', 'error');
            } finally {
                const btn = document.getElementById('btnRecordSale');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> تسجيل المبيعة';
            }
        });
        
        // --- منطق نموذج السحب / الديون الجديد ---
        const amountInput = document.getElementById('withdrawalAmount');
        const calcText = document.getElementById('cashCalcText');
        const walletSelect = document.getElementById('withdrawalWallet');
        
        walletSelect.addEventListener('change', () => {
            amountInput.dispatchEvent(new Event('input'));
        });
        
        amountInput.addEventListener('input', () => {
            const val = parseFloat(amountInput.value) || 0;
            if (walletSelect.value === 'ليبيانا' || walletSelect.value === 'المدار') {
                const cash = val * 0.75;
                calcText.textContent = `(الكاش الفعلي المحسوب: ${cash.toFixed(2)} د.ل)`;
                calcText.classList.remove('hidden-group');
            } else {
                calcText.classList.add('hidden-group');
            }
        });
        
        // تعبئة قائمة الأسماء ديناميكياً
        async function populateDebtorDropdown() {
            const select = document.getElementById('debtorName');
            try {
                // جلب المناديب من مجموعة customers
                const snapshot = await db.collection('customers').where('role', '==', 'staff').get();
                let html = '<option value="" disabled selected>اختر الشخص المسحوب منه الرصيد...</option>';
                
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const name = data.firstName ? (data.firstName + ' ' + (data.lastName || '')).trim() : data.name;
                    if (name) {
                        html += `<option value="${name}">${name}</option>`;
                    }
                });
                select.innerHTML = html;
            } catch (err) {
                console.error("Error fetching staff names:", err);
                select.innerHTML = '<option value="" disabled selected>اختر الشخص المسحوب منه الرصيد... و كمية الرصيد المسحوب منه و هل هوا ليبيانا فقط او مدار فقط او ليبيانا و مدار معا</option><option value="الأدمن">الأدمن (المدير)</option>';
            }
        }
        populateDebtorDropdown();

        // --- تسجيل السحب ---
        document.getElementById('btnRecordWithdrawal').addEventListener('click', async () => {
            const amount = parseFloat(document.getElementById('withdrawalAmount').value);
            const wallet = document.getElementById('withdrawalWallet').value;
            const targetName = document.getElementById('debtorName').value;
            
            if (!wallet) {
                if (typeof showToast === 'function') showToast('الرجاء اختيار المحفظة المسحوب منها!', 'error');
                return;
            }
            if (!targetName) {
                if (typeof showToast === 'function') showToast('الرجاء اختيار الشخص / الجهة!', 'error');
                return;
            }
            
            if (isNaN(amount) || amount <= 0) {
                if (typeof showToast === 'function') showToast('يرجى إدخال القيمة بشكل صحيح', 'error');
                return;
            }
            
            let dataToSave = {
                staffId: uid,
                wallet: wallet,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // تحديد نوع العملية تلقائياً بناءً على المحفظة
            if (wallet === 'ليبيانا' || wallet === 'المدار') {
                dataToSave.type = 'debt_transfer';
                dataToSave.originalCredit = amount;
                dataToSave.amount = amount * 0.75;
                dataToSave.debtor = targetName;
            } else { // كاش
                dataToSave.type = 'withdrawal';
                dataToSave.amount = amount;
                dataToSave.reason = targetName; // حفظ الاسم كسبب للحفاظ على توافق جدول السجل
            }
            
            try {
                const btn = document.getElementById('btnRecordWithdrawal');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التسجيل...';
                
                await db.collection('transactions').add(dataToSave);
                
                if (typeof showToast === 'function') showToast('تم التسجيل بنجاح', 'success');
                document.getElementById('withdrawalAmount').value = '';
                document.getElementById('withdrawalWallet').value = '';
                document.getElementById('debtorName').value = '';
                document.getElementById('cashCalcText').textContent = '(الكاش الفعلي المحسوب: 0 د.ل)';
            } catch (err) {
                console.error('Error recording withdrawal:', err);
                if (typeof showToast === 'function') showToast('حدث خطأ أثناء تسجيل السحب', 'error');
            } finally {
                const btn = document.getElementById('btnRecordWithdrawal');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-minus-circle"></i> تسجيل السحب';
            }
        });
    }
});

// =============================================
// دالة إلغاء العملية المتاحة عالمياً
// =============================================
window.deleteTransaction = async function(transactionId) {
    const isConfirmed = await showConfirm('هل أنت متأكد من إلغاء هذه العملية؟');
    if (isConfirmed) {
        try {
            await db.collection('transactions').doc(transactionId).delete();
            if (typeof showToast === 'function') showToast('تم إلغاء العملية بنجاح', 'success');
        } catch (error) {
            console.error("Error deleting transaction: ", error);
            if (typeof showToast === 'function') showToast('حدث خطأ أثناء إلغاء العملية', 'error');
        }
    }
};
