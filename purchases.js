document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.getElementById('purchasesMainContent');
    const purCategory = document.getElementById('purCategory');
    const purItem = document.getElementById('purItem');

    const ARABIC_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

    // === أدوات مساعدة لبناء معرّف/اسم الشهر ===
    function getMonthId(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    function getMonthLabel(date) {
        return `${ARABIC_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    }
    // حماية بسيطة عند حقن أسماء المنتجات داخل onclick="" في الـ HTML
    function escapeForAttr(str) {
        return String(str == null ? '' : str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.replace('index.html');
            return;
        }
        let isAdmin = (user.uid === ADMIN_UID);
        if (!isAdmin) {
            try {
                const adminDoc = await db.collection('admins').doc(user.uid).get();
                isAdmin = adminDoc.exists;
            } catch (e) { isAdmin = false; }
        }
        if (!isAdmin) {
            window.location.replace('index.html');
            return;
        }
        mainContent.style.display = 'block';
        fetchProductsForDropdown();
        listenToInventory();
        renderMonthlyPurchasesView(); // العرض الافتراضي: آخر 7 أشهر
    });

    let productsData = { iptv: [] };

    function fetchProductsForDropdown() {
        db.collection('products').where('category', '==', 'iptv').get().then(snapshot => {
            snapshot.forEach(doc => {
                productsData.iptv.push(doc.data().name);
            });
        });
    }

    purCategory.addEventListener('change', () => {
        const cat = purCategory.value;
        purItem.innerHTML = '<option value="">اختر المنتج...</option>';

        if (cat === 'smartApps') {
            purItem.innerHTML += '<option value="ibo-bob">ibo-bob (اللوحة الأولى)</option>';
            purItem.innerHTML += '<option value="ibo-one">ibo-one (اللوحة الثانية)</option>';
        } else if (cat === 'vip') {
            purItem.innerHTML += '<option value="باقات VIP">باقات VIP (كمجموعة)</option>';
            purItem.value = "باقات VIP";
        } else if (cat === 'iptv' && productsData.iptv) {
            productsData.iptv.forEach(name => {
                purItem.innerHTML += `<option value="${name}">${name}</option>`;
            });
        }
    });

    // تسجيل الفاتورة وحساب متوسط التكلفة (رأس المال) — تُخزَّن الآن داخل مستند شهرها
    document.getElementById('btnSavePurchase').addEventListener('click', async () => {
        const cat = purCategory.value;
        const item = purItem.value;
        const qty = parseFloat(document.getElementById('purQty').value);
        const price = parseFloat(document.getElementById('purPrice').value);
        const supplier = document.getElementById('purSupplier').value.trim();

        if (!cat || !item || isNaN(qty) || qty <= 0 || isNaN(price) || !supplier) {
            alert('الرجاء تعبئة جميع الحقول بشكل صحيح');
            return;
        }

        const btn = document.getElementById('btnSavePurchase');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        btn.disabled = true;

        try {
            const now = new Date();
            const monthId = getMonthId(now);
            const monthRef = db.collection('purchases').doc(monthId);

            // 1. التأكد من وجود مستند الشهر الحالي (أو تحديث تاريخه) ليظهر في قائمة الأشهر
            await monthRef.set({
                monthLabel: getMonthLabel(now),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            // 2. تسجيل الفاتورة داخل مجموعة فواتير هذا الشهر
            await monthRef.collection('invoices').add({
                category: cat,
                item: item,
                quantity: qty,
                totalPrice: price,
                supplier: supplier,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            // 3. تحديث المخزون وحساب متوسط التكلفة (بدون تغيير عن السابق)
            const inventoryRef = db.collection('inventory').doc(item);
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(inventoryRef);

                let currentCount = 0;
                let currentAverageCost = 0;

                if (doc.exists) {
                    currentCount = doc.data().count || 0;
                    currentAverageCost = doc.data().averageCost || 0;
                }

                const currentTotalCapital = currentCount * currentAverageCost;
                const newCount = currentCount + qty;
                const newTotalCapital = currentTotalCapital + price;
                const newAverageCost = newCount > 0 ? (newTotalCapital / newCount) : 0;

                transaction.set(inventoryRef, {
                    count: newCount,
                    averageCost: newAverageCost,
                    category: cat,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });

            alert('تم تسجيل الفاتورة وإضافة الكمية للمخزن بنجاح ✅');

            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'admin_add_purchase',
                    category: 'admin',
                    severity: 'success',
                    title: `تسجيل فاتورة شراء: ${item} (${qty} قطعة) بسعر ${price} د.ل`,
                    details: { category: cat, item: item, quantity: qty, totalPrice: price, supplier: supplier, monthId: monthId }
                });
            }

            document.getElementById('purQty').value = '';
            document.getElementById('purPrice').value = '';
            document.getElementById('purSupplier').value = '';
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء الحفظ!');
        } finally {
            btn.innerHTML = '<i class="fas fa-save"></i> حفظ الفاتورة وإضافة للمخزن';
            btn.disabled = false;
        }
    });

    // =============================================
    // إدارة وترتيب المخزون لحظياً (سحب وإفلات وأسهم)
    // =============================================
    let inventoryItemsList = [];
    let customInventoryOrder = [];

    try {
        const cachedOrder = localStorage.getItem('almezo_inventory_order');
        if (cachedOrder) {
            customInventoryOrder = JSON.parse(cachedOrder);
        }
    } catch (e) {}

    function getCurrentlySortedIds() {
        return getSortedInventoryItems().map(item => item.id);
    }

    function getSortedInventoryItems() {
        const order = customInventoryOrder || [];
        return [...inventoryItemsList].sort((a, b) => {
            const idxA = order.indexOf(a.id);
            const idxB = order.indexOf(b.id);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.id.localeCompare(b.id, 'ar');
        });
    }

    function renderInventoryGrid() {
        const grid = document.getElementById('inventoryGrid');
        if (!grid) return;

        if (!inventoryItemsList || inventoryItemsList.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color: var(--text-secondary);">المخزن فارغ حالياً</div>';
            return;
        }

        const sortedItems = getSortedInventoryItems();
        let html = '';

        sortedItems.forEach((item, index) => {
            const count = item.data.count || 0;
            const avgCost = item.data.averageCost || 0;
            const totalCapital = count * avgCost;
            const safeId = escapeForAttr(item.id);
            const isFirst = (index === 0);
            const isLast = (index === sortedItems.length - 1);

            html += `
                <div class="inventory-item-card" 
                     draggable="true" 
                     data-item-id="${safeId}"
                     ondragstart="window.onInventoryDragStart(event)"
                     ondragover="window.onInventoryDragOver(event)"
                     ondragleave="window.onInventoryDragLeave(event)"
                     ondrop="window.onInventoryDrop(event)"
                     ondragend="window.onInventoryDragEnd(event)">
                    
                    <div class="inventory-card-top-bar">
                        <span class="inventory-drag-handle" title="اسحب الصنف لتغيير موقعه"><i class="fas fa-grip-vertical"></i></span>
                        <h4 class="inventory-item-title" title="${safeId}">${item.id}</h4>
                        <div class="inventory-card-actions">
                            <button type="button" class="btn-inventory-move" onclick="window.moveInventoryItem('${safeId}', -1)" title="تحريك للأمام (يمين)" ${isFirst ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
                                <i class="fas fa-chevron-right"></i>
                            </button>
                            <button type="button" class="btn-inventory-move" onclick="window.moveInventoryItem('${safeId}', 1)" title="تحريك للخلف (يسار)" ${isLast ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
                                <i class="fas fa-chevron-left"></i>
                            </button>
                            <button type="button" class="btn-inventory-delete" onclick="window.deleteInventoryItem('${safeId}')" title="حذف الصنف من المخزن">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>

                    <div class="inventory-count-val" dir="ltr">${count}</div>

                    <div class="inventory-capital-val">
                        رأس المال: <span class="inventory-capital-amount" dir="ltr">${totalCapital.toFixed(2)} د.ل</span>
                        <br>
                        <span class="inventory-avg-cost">(متوسط التكلفة: ${avgCost.toFixed(2)} د.ل/قطعة)</span>
                    </div>

                    <button type="button" class="inventory-btn-edit" onclick="window.editStock('${safeId}', ${count})">
                        <i class="fas fa-edit"></i> تعديل
                    </button>
                </div>
            `;
        });

        grid.innerHTML = html;
    }

    // جلب المخزون والترتيب المخصص وتحديثه لحظياً
    function listenToInventory() {
        // 1. الاستماع للترتيب المخصص من فايربيس
        db.collection('siteConfig').doc('inventoryOrder').onSnapshot(doc => {
            if (doc.exists && Array.isArray(doc.data().order)) {
                customInventoryOrder = doc.data().order;
                try {
                    localStorage.setItem('almezo_inventory_order', JSON.stringify(customInventoryOrder));
                } catch (e) {}
                renderInventoryGrid();
            }
        }, err => {
            console.warn('تعذر جلب الترتيب من السحابة، الاعتماد على الترتيب المحلي:', err);
        });

        // 2. الاستماع لأصناف المخزون
        db.collection('inventory').onSnapshot(snapshot => {
            if (snapshot.empty) {
                inventoryItemsList = [];
                renderInventoryGrid();
                return;
            }
            inventoryItemsList = [];
            snapshot.forEach(doc => {
                inventoryItemsList.push({
                    id: doc.id,
                    data: doc.data()
                });
            });
            renderInventoryGrid();
        }, err => {
            console.error('Error fetching inventory:', err);
        });
    }

    // أحداث السحب والإفلات
    let draggedItemId = null;

    window.onInventoryDragStart = function (e) {
        const card = e.target.closest('.inventory-item-card');
        if (!card) return;
        draggedItemId = card.getAttribute('data-item-id');
        e.dataTransfer.setData('text/plain', draggedItemId);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => card.classList.add('dragging'), 0);
    };

    window.onInventoryDragOver = function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const card = e.target.closest('.inventory-item-card');
        if (card && card.getAttribute('data-item-id') !== draggedItemId) {
            card.classList.add('drag-over');
        }
    };

    window.onInventoryDragLeave = function (e) {
        const card = e.target.closest('.inventory-item-card');
        if (card) {
            card.classList.remove('drag-over');
        }
    };

    window.onInventoryDrop = function (e) {
        e.preventDefault();
        const targetCard = e.target.closest('.inventory-item-card');
        if (!targetCard) return;
        const targetId = targetCard.getAttribute('data-item-id');
        targetCard.classList.remove('drag-over');

        if (!draggedItemId || draggedItemId === targetId) return;

        const currentSortedIds = getCurrentlySortedIds();
        const fromIdx = currentSortedIds.indexOf(draggedItemId);
        const toIdx = currentSortedIds.indexOf(targetId);

        if (fromIdx !== -1 && toIdx !== -1) {
            currentSortedIds.splice(fromIdx, 1);
            currentSortedIds.splice(toIdx, 0, draggedItemId);
            window.saveInventoryOrder(currentSortedIds);
        }
    };

    window.onInventoryDragEnd = function (e) {
        draggedItemId = null;
        document.querySelectorAll('.inventory-item-card').forEach(card => {
            card.classList.remove('dragging', 'drag-over');
        });
    };

    window.moveInventoryItem = function (itemId, direction) {
        const currentSortedIds = getCurrentlySortedIds();
        const idx = currentSortedIds.indexOf(itemId);
        if (idx === -1) return;

        const targetIdx = idx + direction;
        if (targetIdx < 0 || targetIdx >= currentSortedIds.length) return;

        // تبديل المكانين
        const temp = currentSortedIds[idx];
        currentSortedIds[idx] = currentSortedIds[targetIdx];
        currentSortedIds[targetIdx] = temp;

        window.saveInventoryOrder(currentSortedIds);
    };

    window.saveInventoryOrder = async function (newOrderArray) {
        customInventoryOrder = [...newOrderArray];
        try {
            localStorage.setItem('almezo_inventory_order', JSON.stringify(newOrderArray));
        } catch (e) {}

        // إظهار شارة الحفظ الخضراء
        const badge = document.getElementById('inventoryOrderSaveBadge');
        if (badge) {
            badge.classList.add('show');
            if (window._inventoryBadgeTimer) clearTimeout(window._inventoryBadgeTimer);
            window._inventoryBadgeTimer = setTimeout(() => {
                badge.classList.remove('show');
                badge.style.display = '';
            }, 2200);
        }

        renderInventoryGrid();

        if (typeof db !== 'undefined') {
            try {
                await db.collection('siteConfig').doc('inventoryOrder').set({
                    order: newOrderArray,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (err) {
                console.warn('Firestore write for inventoryOrder failed (using local):', err);
            }
        }
    };

    window.resetInventoryOrderAlphabetical = async function () {
        const ids = inventoryItemsList.map(i => i.id);
        ids.sort((a, b) => a.localeCompare(b, 'ar'));
        await window.saveInventoryOrder(ids);
        if (typeof showToast === 'function') {
            showToast('تمت إعادة ترتيب أصناف المخزن أبجدياً بنجاح!', 'info');
        }
    };

    window.deleteInventoryItem = async function (itemId) {
        let confirmed = (typeof showConfirm === 'function')
            ? await showConfirm(`هل أنت متأكد من حذف صنف (${itemId}) بالكامل من المخزن؟`)
            : confirm(`هل أنت متأكد من حذف صنف (${itemId}) بالكامل من المخزن؟`);
        if (!confirmed) return;
        try {
            await db.collection('inventory').doc(itemId).delete();
            alert('تم حذف الصنف من المخزن بنجاح ✅');

            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'admin_delete_inventory_item',
                    category: 'admin',
                    severity: 'danger',
                    title: 'حذف صنف بالكامل من المخزن: ' + itemId,
                    details: { itemId: itemId }
                });
            }
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء حذف الصنف!');
        }
    };

    window.editStock = async function (itemId, currentCount) {
        const newCount = (typeof showPrompt === 'function')
            ? await showPrompt(`تعديل عدد قطع (${itemId}):`, currentCount, 'تعديل المخزون')
            : prompt(`تعديل عدد قطع (${itemId}):`, currentCount);
        if (newCount !== null && String(newCount).trim() !== '') {
            const parsed = parseFloat(newCount); // التعديل هنا لقبول الكسور
            if (!isNaN(parsed)) {
                await db.collection('inventory').doc(itemId).update({
                    count: parsed,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });

                if (typeof logActivity === 'function') {
                    logActivity({
                        action: 'admin_edit_inventory_stock',
                        category: 'admin',
                        severity: 'warning',
                        title: `تعديل كمية المخزون يدوياً: ${itemId} (${currentCount} ← ${parsed})`,
                        details: { itemId: itemId, oldCount: currentCount, newCount: parsed }
                    });
                }
            }
        }
    };

    // =============================================
    // بناء صف فاتورة واحد (تُستخدم بالعرض الشهري وبنتائج البحث)
    // =============================================
    function renderInvoiceRow(monthId, docId, data) {
        const d = data.timestamp ? data.timestamp.toDate() : new Date();
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const dateStr = `<span dir="ltr">${day}/${month}/${year} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>`;
        return `
            <tr>
                <td style="text-align: right;">${dateStr}</td>
                <td>${data.item}</td>
                <td style="color:#4caf50; font-weight:bold;" dir="ltr">+${data.quantity}</td>
                <td style="color:#ff9800; font-weight:bold;" dir="ltr">${data.totalPrice} د.ل</td>
                <td>${data.supplier}</td>
                <td>
                    <button class="btn-delete-trans" onclick="deletePurchase('${monthId}', '${docId}', '${escapeForAttr(data.item)}', ${data.quantity}, ${data.totalPrice})" title="حذف الفاتورة">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }

    function emptyTableHtml(message) {
        return `<div class="table-empty-message mt-20">${message}</div>`;
    }

    function monthTableWrapper(monthId, monthLabel) {
        return `
            <h4 class="page-title table-section-title" style="margin-top:30px; font-size:1.1rem; color:var(--blue-accent);">
                <i class="fas fa-calendar-alt"></i> فواتير شهر ${monthLabel}
            </h4>
            <div class="table-responsive table-scrollable" style="margin-bottom: 20px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>التاريخ</th>
                            <th>المنتج</th>
                            <th>الكمية المضافة</th>
                            <th>السعر الإجمالي</th>
                            <th>المورد</th>
                            <th>الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody id="purMonthTable_${monthId}">
                        <tr><td colspan="6" class="table-empty-message">جاري التحميل...</td></tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    // =============================================
    // العرض الافتراضي: آخر 7 أشهر، كل شهر جدوله الخاص، معروضة فوق بعض
    // =============================================
    let monthlyInvoiceUnsubs = [];
    let monthsListUnsub = null;

    window.renderMonthlyPurchasesView = function () {
        const container = document.getElementById('purchasesHistoryContainer');
        if (!container) return;

        // إيقاف أي مستمعين سابقين (بحث أو عرض شهري قديم) قبل البدء من جديد
        stopAllPurchaseListeners();

        container.innerHTML = emptyTableHtml('جاري جلب البيانات...');

        // ملاحظة: تم إزالة orderBy(documentId) و limit() من الاستعلام عمداً حتى لا يحتاج فهرس (Index) في فايربيز.
        // الترتيب (الأحدث أولاً) والتحديد بآخر 7 أشهر يتم الآن محلياً بالجافاسكريبت.
        monthsListUnsub = db.collection('purchases')
            .onSnapshot(monthsSnapshot => {
                monthlyInvoiceUnsubs.forEach(u => u());
                monthlyInvoiceUnsubs = [];

                if (monthsSnapshot.empty) {
                    container.innerHTML = emptyTableHtml('لا توجد فواتير مسجلة بعد');
                    return;
                }

                // نتجاهل أي مستند معرّفه (ID) مش بصيغة شهر حقيقية (مثل 2026-08)
                // هذه غالباً فواتير قديمة لم تُرحّل بعد للبنية الجديدة (راجع migrate_purchases_to_monthly.js)
                const monthIdPattern = /^\d{4}-\d{2}$/;
                const validMonthDocs = monthsSnapshot.docs.filter(d => monthIdPattern.test(d.id));

                if (validMonthDocs.length === 0) {
                    container.innerHTML = emptyTableHtml('لا توجد فواتير مسجلة بعد');
                    return;
                }

                const sortedMonthDocs = validMonthDocs
                    .slice()
                    .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)) // الأحدث أولاً (معرّف الشهر مثل 2026-08)
                    .slice(0, 7); // آخر 7 أشهر فقط

                container.innerHTML = sortedMonthDocs
                    .map(monthDoc => monthTableWrapper(monthDoc.id, (monthDoc.data() || {}).monthLabel || monthDoc.id))
                    .join('');

                sortedMonthDocs.forEach(monthDoc => {
                    const monthId = monthDoc.id;
                    // ملاحظة: تم إزالة orderBy('timestamp') من الاستعلام عمداً حتى لا يحتاج فهرس (Index) في فايربيز.
                    // الترتيب يتم الآن محلياً بالجافاسكريبت بعد وصول البيانات (نفس أسلوب دالة البحث تحت).
                    const unsub = monthDoc.ref.collection('invoices')
                        .onSnapshot(invSnapshot => {
                            const tbody = document.getElementById(`purMonthTable_${monthId}`);
                            if (!tbody) return;
                            if (invSnapshot.empty) {
                                tbody.innerHTML = '<tr><td colspan="6" class="table-empty-message">لا توجد فواتير لهذا الشهر</td></tr>';
                                return;
                            }
                            const sortedDocs = invSnapshot.docs.slice().sort((a, b) => {
                                const ta = a.data().timestamp ? a.data().timestamp.toMillis() : 0;
                                const tb = b.data().timestamp ? b.data().timestamp.toMillis() : 0;
                                return tb - ta; // الأحدث أولاً
                            });
                            tbody.innerHTML = sortedDocs
                                .map(doc => renderInvoiceRow(monthId, doc.id, doc.data()))
                                .join('');
                        }, err => console.warn('تعذر تحميل فواتير شهر ' + monthId, err));

                    monthlyInvoiceUnsubs.push(unsub);
                });
            }, err => {
                console.error('تعذر تحميل قائمة الأشهر:', err);
                container.innerHTML = emptyTableHtml('تعذر تحميل السجل');
            });
    };

    // =============================================
    // البحث بالتاريخ محلياً في الجافاسكريبت (بدون الحاجة لأي فهارس في فايربيز)
    // =============================================
    let searchUnsub = null;

    function stopAllPurchaseListeners() {
        monthlyInvoiceUnsubs.forEach(u => u());
        monthlyInvoiceUnsubs = [];
        if (monthsListUnsub) { monthsListUnsub(); monthsListUnsub = null; }
        if (searchUnsub) { searchUnsub(); searchUnsub = null; }
    }

    window.searchPurchasesHistory = async function () {
        const startInput = document.getElementById('purchasesStartDate').value;
        const endInput = document.getElementById('purchasesEndDate').value;

        let startDate = null;
        let endDate = null;

        if (startInput) {
            startDate = new Date(startInput);
            startDate.setHours(0, 0, 0, 0);
        }
        if (endInput) {
            endDate = new Date(endInput);
            endDate.setHours(23, 59, 59, 999);
        }

        if (!startDate && !endDate) {
            alert('يرجى اختيار تاريخ للبحث');
            return;
        }

        stopAllPurchaseListeners();

        const container = document.getElementById('purchasesHistoryContainer');
        container.innerHTML = emptyTableHtml('جاري البحث...');

        try {
            const monthsSnap = await db.collection('purchases').get();
            let allInvoices = [];

            for (const monthDoc of monthsSnap.docs) {
                const invSnap = await monthDoc.ref.collection('invoices').get();
                invSnap.forEach(invDoc => {
                    const data = invDoc.data();
                    const d = data.timestamp ? data.timestamp.toDate() : new Date();

                    if (startDate && d < startDate) return;
                    if (endDate && d > endDate) return;

                    allInvoices.push({
                        monthId: monthDoc.id,
                        docId: invDoc.id,
                        data: data,
                        date: d
                    });
                });
            }

            allInvoices.sort((a, b) => b.date - a.date);

            if (allInvoices.length === 0) {
                container.innerHTML = emptyTableHtml('لا توجد فواتير في هذه الفترة');
                return;
            }

            const rows = allInvoices.map(inv => renderInvoiceRow(inv.monthId, inv.docId, inv.data)).join('');

            container.innerHTML = `
                <h4 class="page-title table-section-title" style="margin-top:30px; font-size:1.1rem; color:var(--blue-accent);">
                    <i class="fas fa-search"></i> نتائج البحث
                </h4>
                <div class="table-responsive table-scrollable" style="margin-bottom: 20px;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>التاريخ</th>
                                <th>المنتج</th>
                                <th>الكمية المضافة</th>
                                <th>السعر الإجمالي</th>
                                <th>المورد</th>
                                <th>الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        } catch (err) {
            console.error('خطأ في البحث:', err);
            container.innerHTML = emptyTableHtml('تعذر إتمام البحث.');
        }
    };

    window.resetPurchasesView = function () {
        document.getElementById('purchasesStartDate').value = '';
        document.getElementById('purchasesEndDate').value = '';
        renderMonthlyPurchasesView();
    };

    // تهيئة Flatpickr لحقول التاريخ
    if (typeof flatpickr !== 'undefined') {
        const flatpickrConfig = {
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d/m/Y",
            allowInput: true,
            disableMobile: true
        };
        flatpickr("#purchasesStartDate", flatpickrConfig);
        flatpickr("#purchasesEndDate", flatpickrConfig);
    }

    // حذف الفاتورة (من مستند شهرها) وخصم كميتها من المخزن وتعديل رأس المال
    window.deletePurchase = async function (monthId, purchaseId, itemName, qty, totalPrice) {
        let confirmed = (typeof showConfirm === 'function')
            ? await showConfirm(`هل أنت متأكد من حذف هذه الفاتورة؟\nسيتم خصم (${qty}) قطعة من مخزن (${itemName}) وتعديل رأس المال.`)
            : confirm(`هل أنت متأكد من حذف هذه الفاتورة؟\nسيتم خصم (${qty}) قطعة من مخزن (${itemName}) وتعديل رأس المال.`);
        if (!confirmed) return;

        try {
            // 1. حذف وثيقة الفاتورة من مجموعة فواتير شهرها
            await db.collection('purchases').doc(monthId).collection('invoices').doc(purchaseId).delete();

            // 2. تحديث المخزون (خصم الكمية وإرجاع رأس المال) — بدون تغيير عن السابق
            const inventoryRef = db.collection('inventory').doc(itemName);
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(inventoryRef);
                if (!doc.exists) return;

                const currentCount = doc.data().count || 0;
                const currentAvgCost = doc.data().averageCost || 0;
                const currentTotalCapital = currentCount * currentAvgCost;

                const newCount = Math.max(0, currentCount - qty);
                const newTotalCapital = Math.max(0, currentTotalCapital - totalPrice);
                const newAverageCost = newCount > 0 ? (newTotalCapital / newCount) : 0;

                transaction.set(inventoryRef, {
                    count: newCount,
                    averageCost: newAverageCost,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });

            alert('تم حذف الفاتورة وتحديث المخزن بنجاح ✅');

            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'admin_delete_purchase',
                    category: 'admin',
                    severity: 'danger',
                    title: `حذف فاتورة شراء: ${itemName} (${qty} قطعة) بقيمة ${totalPrice} د.ل`,
                    details: { monthId: monthId, purchaseId: purchaseId, item: itemName, quantity: qty, totalPrice: totalPrice }
                });
            }
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء حذف الفاتورة!');
        }
    };
});
