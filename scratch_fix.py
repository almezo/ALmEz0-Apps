import re

with open("ui.js", "r", encoding="utf-8") as f:
    content = f.read()

# Find the block from "// Firestore Realtime Listener" to the next "// Temporary migration script"
start_marker = "// Firestore Realtime Listener"
end_marker = "// Temporary migration script"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    correct_block = """// Firestore Realtime Listener
if (typeof db !== 'undefined') {
    db.collection('products').onSnapshot((snapshot) => {
        // إذا كانت القاعدة فارغة (لم يتم الترحيل بعد)، لا تقم بمسح siteData الأصلية لتسمح بالترحيل
        if (snapshot.empty && !isDataLoadedFromFirestore) {
            console.log("قاعدة البيانات فارغة، سيتم الاحتفاظ ببيانات data.js مؤقتاً للترحيل.");
            return;
        }

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

"""
    new_content = content[:start_idx] + correct_block + content[end_idx:]
    with open("ui.js", "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Fixed onSnapshot block successfully.")
else:
    print("Markers not found!")
