import sys
import re

file_path = "ui.js"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add variables at top of file
var_block = """
// === متغيرات عامة ===
const ADMIN_UID = 'ضع_الـUID_هنا';
let isEditMode = false;
let isDataLoadedFromFirestore = false;

window.renderCurrentPage = function() {
    if (document.getElementById('vip-container')) renderLogoList('vip', 'vip-container', 'vip-details.html');
    if (window.location.pathname.includes('vip-details')) renderDetails('vip');
    if (document.getElementById('smart-container')) renderLogoList('smartApps', 'smart-container', 'app-details.html');
    if (document.getElementById('iptv-container')) renderIptvList('iptv-container');
    if (window.location.pathname.includes('server-details')) renderDetails('iptv');
    if (window.location.pathname.includes('app-details')) renderDetails('smartApps');
};

function checkAdminMode() {
    const user = getCurrentUser();
    if (user && user.uid === ADMIN_UID) {
        if (!document.getElementById('adminFab')) {
            const fab = document.createElement('div');
            fab.id = 'adminFab';
            fab.className = 'admin-fab';
            fab.innerHTML = '<i class="fas fa-edit"></i>';
            fab.onclick = function() {
                isEditMode = !isEditMode;
                fab.classList.toggle('edit-mode-active', isEditMode);
                fab.innerHTML = isEditMode ? '<i class="fas fa-times"></i>' : '<i class="fas fa-edit"></i>';
                renderCurrentPage();
            };
            document.body.appendChild(fab);
        }
    } else {
        const fab = document.getElementById('adminFab');
        if (fab) fab.remove();
        isEditMode = false;
    }
}

// Firestore Realtime Listener
if (typeof db !== 'undefined') {
    db.collection('products').onSnapshot((snapshot) => {
        siteData = { iptv: [], smartApps: [], vip: [] };
        snapshot.forEach(doc => {
            const data = doc.data();
            if (!siteData[data.category]) siteData[data.category] = [];
            siteData[data.category].push({id: doc.id, ...data});
        });
        isDataLoadedFromFirestore = true;
        renderCurrentPage();
    });
}

// Temporary migration script
window.migrateDataToFirestore = async function() {
    console.log("بدأ الترحيل...");
    const batch = db.batch();
    let count = 0;
    
    if (isDataLoadedFromFirestore) {
        console.warn("البيانات قادمة من فايربيز، يرجى الترحيل من data.js الأصلية فقط!");
        showToast("تنبيه: يجب تعطيل onSnapshot مؤقتاً للترحيل أو الترحيل عند أول تحميل", "error");
        // return;
    }

    for (const [category, items] of Object.entries(siteData)) {
        for (const item of items) {
            const docRef = db.collection('products').doc(item.id);
            const { id, ...rest } = item;
            batch.set(docRef, { ...rest, category: category });
            count++;
        }
    }
    
    await batch.commit();
    console.log(`تم ترحيل ${count} منتج بنجاح إلى فايربيز!`);
    showToast("تم ترحيل البيانات بنجاح!", "success");
};

// Admin Crud Functions
window.saveProduct = async function(id) {
    const name = document.getElementById(`edit-name-${id}`).value;
    const logo = document.getElementById(`edit-logo-${id}`).value;
    
    try {
        await db.collection('products').doc(id).update({
            name: name,
            logo: logo
        });
        showToast('تم حفظ التعديلات بنجاح!', 'success');
    } catch(e) {
        console.error(e);
        showToast('حدث خطأ أثناء الحفظ', 'error');
    }
};

window.deleteProduct = async function(id) {
    if (confirm('هل أنت متأكد من حذف هذا المنتج نهائياً؟')) {
        try {
            await db.collection('products').doc(id).delete();
            showToast('تم حذف المنتج', 'info');
        } catch(e) {
            console.error(e);
            showToast('حدث خطأ أثناء الحذف', 'error');
        }
    }
};

window.addNewProduct = async function(categoryKey) {
    const id = prompt('أدخل ID مميز باللغة الإنجليزية (مثال: new_server):');
    if (!id) return;
    
    const name = prompt('أدخل اسم المنتج:');
    if (!name) return;
    
    try {
        await db.collection('products').doc(id).set({
            category: categoryKey,
            name: name,
            logo: 'photo/placeholder.png',
            plans: [{ duration: "سنة واحدة", price: "50 د.ل" }]
        });
        showToast('تم إضافة المنتج بنجاح!', 'success');
    } catch(e) {
        console.error(e);
        showToast('حدث خطأ أثناء الإضافة', 'error');
    }
};

window.saveProductDetails = async function(id, categoryKey) {
    const plansStr = document.getElementById(`edit-plans-${id}`).value;
    let updates = {};
    
    try {
        updates.plans = JSON.parse(plansStr);
    } catch(e) {
        showToast('خطأ في صيغة JSON لخطط الأسعار', 'error');
        return;
    }
    
    const descEl = document.getElementById(`edit-desc-${id}`);
    if (descEl) updates.description = descEl.value;
    
    const appsEl = document.getElementById(`edit-apps-${id}`);
    if (appsEl) {
        try {
            updates.apps = JSON.parse(appsEl.value);
        } catch(e) {
            showToast('خطأ في صيغة JSON للروابط', 'error');
            return;
        }
    }
    
    try {
        await db.collection('products').doc(id).update(updates);
        showToast('تم حفظ التحديثات بنجاح!', 'success');
    } catch(e) {
        console.error(e);
        showToast('حدث خطأ أثناء الحفظ', 'error');
    }
};

"""
content = re.sub(r"// === متغيرات عامة ===", var_block, content, count=1)

# 2. Update updateHeaderLoginState to call checkAdminMode
old_update_header = """    if (isUserLoggedIn()) {
        var user = getCurrentUser();
        btn.innerHTML = '<i class="fas fa-user-check"></i> ' + (user.firstName || 'حسابي');
        btn.classList.add('logged-in');
        btn.onclick = function () { openLogoutModal(); };
    } else {
        btn.innerHTML = 'تسجيل الدخول';
        btn.classList.remove('logged-in');
        btn.onclick = function () { openLoginModal(); };
    }
}"""

new_update_header = """    if (isUserLoggedIn()) {
        var user = getCurrentUser();
        btn.innerHTML = '<i class="fas fa-user-check"></i> ' + (user.firstName || 'حسابي');
        btn.classList.add('logged-in');
        btn.onclick = function () { openLogoutModal(); };
    } else {
        btn.innerHTML = 'تسجيل الدخول';
        btn.classList.remove('logged-in');
        btn.onclick = function () { openLoginModal(); };
    }
    checkAdminMode();
}"""
content = content.replace(old_update_header, new_update_header)

# 3. Replace renderIptvList
old_iptv_list = """function renderIptvList(containerId) {
    var container = document.getElementById(containerId);
    if (!container || !siteData.iptv) return;

    var html = '';
    siteData.iptv.forEach(function (server) {
        html += '\\
        <a href="server-details.html?id=' + server.id + '" class="product-card iptv-logo-card">\\
            <img src="' + server.logo + '" alt="' + server.name + '" class="server-logo"\\
                onerror="this.src=\\'https://via.placeholder.com/100x100/141820/4caf50?text=TV\\'">\\
            <h3>' + server.name + '</h3>\\
        </a>';
    });
    container.innerHTML = html;
}"""

new_iptv_list = """function renderIptvList(containerId) {
    var container = document.getElementById(containerId);
    if (!container || !siteData.iptv) return;

    var html = '';
    siteData.iptv.forEach(function (server) {
        if (isEditMode) {
            html += '\\
            <div class="product-card iptv-logo-card">\\
                <input type="text" id="edit-name-'+server.id+'" value="'+server.name+'" class="edit-input" placeholder="اسم السيرفر">\\
                <input type="text" id="edit-logo-'+server.id+'" value="'+server.logo+'" class="edit-input" placeholder="رابط الشعار">\\
                <button class="admin-action-btn admin-save-btn" onclick="saveProduct(\\''+server.id+'\\')"><i class="fas fa-save"></i> حفظ</button>\\
                <button class="admin-action-btn admin-delete-btn" onclick="deleteProduct(\\''+server.id+'\\')"><i class="fas fa-trash"></i> حذف</button>\\
                <a href="server-details.html?id=' + server.id + '" style="margin-top:10px; font-size:12px; color:var(--text-secondary);">تعديل التفاصيل والأسعار &rarr;</a>\\
            </div>';
        } else {
            html += '\\
            <a href="server-details.html?id=' + server.id + '" class="product-card iptv-logo-card">\\
                <img src="' + server.logo + '" alt="' + server.name + '" class="server-logo"\\
                    onerror="this.src=\\'https://via.placeholder.com/100x100/141820/4caf50?text=TV\\'">\\
                <h3>' + server.name + '</h3>\\
            </a>';
        }
    });
    
    if (isEditMode) {
        html += '<div class="admin-add-btn" onclick="addNewProduct(\\'iptv\\')"><i class="fas fa-plus-circle"></i>إضافة سيرفر جديد</div>';
    }
    container.innerHTML = html;
}"""
content = content.replace(old_iptv_list, new_iptv_list)

# 4. Replace renderLogoList
old_logo_list = """function renderLogoList(categoryKey, containerId, detailPageName) {
    var container = document.getElementById(containerId);
    if (!container || !siteData[categoryKey]) return;

    var html = '';
    siteData[categoryKey].forEach(function (item) {
        html += '\\
        <a href="' + detailPageName + '?id=' + item.id + '" class="product-card iptv-logo-card">\\
            <img src="' + item.logo + '" alt="' + item.name + '" class="server-logo"\\
                onerror="this.src=\\'https://via.placeholder.com/100x100/141820/4caf50?text=App\\'">\\
            <h3>' + item.name + '</h3>\\
        </a>';
    });
    container.innerHTML = html;
}"""

new_logo_list = """function renderLogoList(categoryKey, containerId, detailPageName) {
    var container = document.getElementById(containerId);
    if (!container || !siteData[categoryKey]) return;

    var html = '';
    siteData[categoryKey].forEach(function (item) {
        if (isEditMode) {
            html += '\\
            <div class="product-card iptv-logo-card">\\
                <input type="text" id="edit-name-'+item.id+'" value="'+item.name+'" class="edit-input" placeholder="الاسم">\\
                <input type="text" id="edit-logo-'+item.id+'" value="'+item.logo+'" class="edit-input" placeholder="رابط الشعار">\\
                <button class="admin-action-btn admin-save-btn" onclick="saveProduct(\\''+item.id+'\\')"><i class="fas fa-save"></i> حفظ</button>\\
                <button class="admin-action-btn admin-delete-btn" onclick="deleteProduct(\\''+item.id+'\\')"><i class="fas fa-trash"></i> حذف</button>\\
                <a href="' + detailPageName + '?id=' + item.id + '" style="margin-top:10px; font-size:12px; color:var(--text-secondary);">تعديل التفاصيل والأسعار &rarr;</a>\\
            </div>';
        } else {
            html += '\\
            <a href="' + detailPageName + '?id=' + item.id + '" class="product-card iptv-logo-card">\\
                <img src="' + item.logo + '" alt="' + item.name + '" class="server-logo"\\
                    onerror="this.src=\\'https://via.placeholder.com/100x100/141820/4caf50?text=App\\'">\\
                <h3>' + item.name + '</h3>\\
            </a>';
        }
    });
    
    if (isEditMode) {
        html += '<div class="admin-add-btn" onclick="addNewProduct(\\''+categoryKey+'\\')"><i class="fas fa-plus-circle"></i>إضافة عنصر جديد</div>';
    }
    container.innerHTML = html;
}"""
content = content.replace(old_logo_list, new_logo_list)

# 5. Replace renderDetails
old_details_start = """    // بناء بطاقات خطط الأسعار
    var plansHtml = '';
    item.plans.forEach(function (plan) {
        // إصلاح: تضمين السعر مع المدة في الحقل المخفي
        plansHtml += '\\
        <div class="product-card plan-card">\\
            <h3 class="plan-duration">' + plan.duration + '</h3>\\
            <p class="plan-price">' + plan.price + '</p>\\
            <input type="hidden" value="' + plan.duration + ' - ' + plan.price + '">\\
            <button class="buy-btn" onclick="openModal(\\'' + item.name + '\\', this, \\'' + categoryKey + '\\')">\\
                <i class="fas fa-shopping-cart"></i> شراء الآن\\
            </button>\\
        </div>';
    });

    var plansContainer = document.getElementById('plans-container');
    if (plansContainer) plansContainer.innerHTML = plansHtml;

    // روابط تحميل التطبيقات (لسيرفرات IPTV فقط)
    if (categoryKey === 'iptv' && item.apps) {"""

new_details_start = """    // بناء بطاقات خطط الأسعار
    var plansHtml = '';
    
    if (isEditMode) {
        plansHtml += '<div style="grid-column: 1 / -1; margin-bottom: 20px; text-align:right;">';
        plansHtml += '<h4 style="margin-bottom:8px; color:var(--warning);">تعديل خطط الأسعار (JSON Array)</h4>';
        plansHtml += '<textarea id="edit-plans-'+item.id+'" class="edit-textarea" placeholder="خطط الأسعار (JSON)">' + JSON.stringify(item.plans, null, 2) + '</textarea>';
        if (item.description !== undefined) {
             plansHtml += '<h4 style="margin-bottom:8px; margin-top:15px; color:var(--warning);">تعديل الوصف (HTML)</h4>';
             plansHtml += '<textarea id="edit-desc-'+item.id+'" class="edit-textarea" placeholder="الوصف (HTML)">' + item.description + '</textarea>';
        }
        if (item.apps !== undefined) {
             plansHtml += '<h4 style="margin-bottom:8px; margin-top:15px; color:var(--warning);">تعديل الروابط (JSON)</h4>';
             plansHtml += '<textarea id="edit-apps-'+item.id+'" class="edit-textarea" placeholder="الروابط (JSON)">' + JSON.stringify(item.apps, null, 2) + '</textarea>';
        }
        plansHtml += '<button class="admin-action-btn admin-save-btn" onclick="saveProductDetails(\\''+item.id+'\\', \\''+categoryKey+'\\')"><i class="fas fa-save"></i> حفظ جميع التحديثات</button>';
        plansHtml += '</div>';
    } else {
        item.plans.forEach(function (plan) {
            plansHtml += '\\
            <div class="product-card plan-card">\\
                <h3 class="plan-duration">' + plan.duration + '</h3>\\
                <p class="plan-price">' + plan.price + '</p>\\
                <input type="hidden" value="' + plan.duration + ' - ' + plan.price + '">\\
                <button class="buy-btn" onclick="openModal(\\'' + item.name + '\\', this, \\'' + categoryKey + '\\')">\\
                    <i class="fas fa-shopping-cart"></i> شراء الآن\\
                </button>\\
            </div>';
        });
    }

    var plansContainer = document.getElementById('plans-container');
    if (plansContainer) plansContainer.innerHTML = plansHtml;

    // روابط تحميل التطبيقات (لسيرفرات IPTV فقط)
    if (!isEditMode && categoryKey === 'iptv' && item.apps) {"""

content = content.replace(old_details_start, new_details_start)

# 6. Hide description if edit mode
old_desc = """    // إصلاح: عرض وصف باقات VIP (كان مفقوداً في النسخة السابقة)
    if (item.description) {"""

new_desc = """    // إصلاح: عرض وصف باقات VIP (كان مفقوداً في النسخة السابقة)
    if (!isEditMode && item.description) {"""
content = content.replace(old_desc, new_desc)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("ui.js updated successfully!")
