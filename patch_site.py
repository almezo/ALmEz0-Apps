import os

print("Starting to patch ALmEz0 site files...")

# 1. Update firestore.rules
try:
    with open("firestore.rules", "r", encoding="utf-8") as f:
        rules = f.read()
    
    if "match /inventory" not in rules:
        new_rules = rules.replace("match /siteConfig/{configId} {", '''// صلاحيات المخزن والمشتريات
    match /inventory/{itemId} {
      allow read: if request.auth != null && (isAdmin() || get(/databases/$(database)/documents/customers/$(request.auth.uid)).data.role == 'staff');
      allow update: if request.auth != null && (isAdmin() || get(/databases/$(database)/documents/customers/$(request.auth.uid)).data.role == 'staff');
      allow create, delete: if isAdmin();
    }
    match /purchases/{purchaseId} {
      allow read, write: if isAdmin();
    }

    match /siteConfig/{configId} {''')
        with open("firestore.rules", "w", encoding="utf-8") as f:
            f.write(new_rules)
        print("Updated firestore.rules")
    else:
        print("firestore.rules already updated.")
except Exception as e:
    print(f"Failed to update firestore.rules: {e}")

# 2. Update style.css
try:
    with open("style.css", "r", encoding="utf-8") as f:
        css = f.read()
    
    if "purchases-fab" not in css:
        css += '''
/* زر لوحة المشتريات والمخزون للمدير */
.floating-btn.purchases-fab, #adminPurchasesBtn {
    background: linear-gradient(135deg, #00bfa5, #00b0ff) !important;
    border: 1.5px solid rgba(0, 191, 165, 0.5) !important;
    box-shadow: 0 4px 15px rgba(0, 191, 165, 0.45), 0 0 12px rgba(0, 176, 255, 0.3) !important;
}
.floating-btn.purchases-fab:hover, #adminPurchasesBtn:hover {
    box-shadow: 0 6px 20px rgba(0, 191, 165, 0.7), 0 0 18px rgba(0, 176, 255, 0.5) !important;
}
'''
        with open("style.css", "w", encoding="utf-8") as f:
            f.write(css)
        print("Updated style.css")
    else:
        print("style.css already updated.")
except Exception as e:
    print(f"Failed to update style.css: {e}")

# 3. Update ui.js
try:
    with open("ui.js", "r", encoding="utf-8") as f:
        uijs = f.read()
    
    if "adminPurchasesBtn" not in uijs:
        old_code = '''            fabContainer.appendChild(editFab);
            fabContainer.appendChild(staffFab);
            fabContainer.appendChild(reportsFab);
            fabContainer.appendChild(securityFab);
        } else if (user.role === 'staff' || user.role === 'admin') {'''
        
        new_code = '''            // 5. زر المشتريات والمخزن (تركوازي جديد)
            const purchasesFab = document.createElement('button');
            purchasesFab.id = 'adminPurchasesBtn';
            purchasesFab.className = 'floating-btn purchases-fab';
            purchasesFab.innerHTML = '<i class="fas fa-boxes-packing"></i>';
            purchasesFab.title = 'لوحة المشتريات والمخزون';
            purchasesFab.onclick = function () { window.location.href = 'purchases.html'; };

            fabContainer.appendChild(editFab);
            fabContainer.appendChild(staffFab);
            fabContainer.appendChild(reportsFab);
            fabContainer.appendChild(securityFab);
            fabContainer.appendChild(purchasesFab);
        } else if (user.role === 'staff' || user.role === 'admin') {'''
        
        uijs = uijs.replace(old_code, new_code)
        with open("ui.js", "w", encoding="utf-8") as f:
            f.write(uijs)
        print("Updated ui.js")
    else:
        print("ui.js already updated.")
except Exception as e:
    print(f"Failed to update ui.js: {e}")

# 4. Update staff.html
try:
    with open("staff.html", "r", encoding="utf-8") as f:
        staffhtml = f.read()
    
    if "staffInventoryGrid" not in staffhtml:
        old_html = '''        <!-- تصفية سجل المبيعات والعمليات -->
        <div class="history-search-container">'''
        
        new_html = '''        <!-- صندوق المخزون المتاح للمناديب -->
        <h3 class="page-title table-section-title"><i class="fas fa-cubes"></i> الكميات المتوفرة في المخزن للبيع</h3>
        <div class="main-category-card staff-card right-text mb-20">
            <div id="staffInventoryGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 15px; text-align: center;">
                <div style="color: var(--text-secondary); width: 100%; grid-column: 1/-1;">جاري تحميل المخزون...</div>
            </div>
        </div>

        <!-- تصفية سجل المبيعات والعمليات -->
        <div class="history-search-container">'''
        
        staffhtml = staffhtml.replace(old_html, new_html)
        with open("staff.html", "w", encoding="utf-8") as f:
            f.write(staffhtml)
        print("Updated staff.html")
    else:
        print("staff.html already updated.")
except Exception as e:
    print(f"Failed to update staff.html: {e}")

# 5. Update staff.js
try:
    with open("staff.js", "r", encoding="utf-8") as f:
        staffjs = f.read()

    # Part A: Deduct inventory
    if "inventoryItemName" not in staffjs:
        old_js1 = "await db.collection('transactions').add(saleData);"
        new_js1 = '''await db.collection('transactions').add(saleData);

                // === تحديث المخزون (خصم قطعة واحدة تلقائياً) ===
                let inventoryItemName = String(product);
                if (cat === 'smartApps' || cat === 'smart') {
                    inventoryItemName = 'برامج شاشات سمارت';
                } else if (cat === 'vip') {
                    inventoryItemName = 'باقات VIP';
                }
                try {
                    await db.collection('inventory').doc(inventoryItemName).set({
                        count: firebase.firestore.FieldValue.increment(-1),
                        category: cat,
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                } catch(invErr) {
                    console.warn('تعذر تحديث المخزون:', invErr);
                }'''
        staffjs = staffjs.replace(old_js1, new_js1)
        
    # Part B: Call listener
    if "listenToStaffInventory" not in staffjs:
        old_js2 = '''setupImageExportListener();
    });'''
        new_js2 = '''setupImageExportListener();
        if(typeof window.listenToStaffInventory === 'function') window.listenToStaffInventory();
    });'''
        staffjs = staffjs.replace(old_js2, new_js2)

        # Append function
        staffjs += '''

// =============================================
// عرض المخزون للمناديب (للقراءة فقط وتتحدث لحظياً)
// =============================================
window.listenToStaffInventory = function() {
    const grid = document.getElementById('staffInventoryGrid');
    if(!grid) return;
    
    db.collection('inventory').onSnapshot(snapshot => {
        if(snapshot.empty) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color: var(--text-secondary);">لا توجد أصناف في المخزن حالياً</div>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            let count = data.count || 0;
            // أخضر لو متوفر، برتقالي لو قارب على النفاذ، أحمر لو نفذ
            let colorClass = count > 5 ? '#4caf50' : (count > 0 ? '#ff9800' : '#f44336'); 
            html += `
                <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; display: flex; flex-direction: column; justify-content: center;">
                    <h4 style="margin: 0 0 10px 0; font-size: 0.9rem; color: var(--blue-accent);">${doc.id}</h4>
                    <div style="font-size: 1.6rem; font-weight: bold; color: ${colorClass};" dir="ltr">${count}</div>
                </div>
            `;
        });
        grid.innerHTML = html;
    }, err => {
        console.warn('Error fetching inventory:', err);
    });
};
'''
        with open("staff.js", "w", encoding="utf-8") as f:
            f.write(staffjs)
        print("Updated staff.js")
    else:
        print("staff.js already updated.")
except Exception as e:
    print(f"Failed to update staff.js: {e}")

print("All patches applied successfully!")
