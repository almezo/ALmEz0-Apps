// =============================================
// سكربت ترحيل (نسخة معدّلة - آمنة للتكرار)
// ينقل الفواتير القديمة (مباشرة تحت purchases) إلى البنية الجديدة:
// purchases/{2026-08}/invoices/{invoiceId}
//
// الفرق عن النسخة الأولى: لو حصل خطأ في فاتورة واحدة، يتم تخطيها
// والاستمرار في نقل الباقي، بدل ما السكربت كله يتوقف.
// آمن تشغّله أكتر من مرة: أي فاتورة اتنقلت واتمسحت قبل كده مش هتظهر تاني.
//
// طريقة التشغيل: نفس الطريقة القديمة (افتح purchases.html كأدمن،
// افتح Console، الصق الكود، Enter).
// =============================================
(async function migratePurchasesToMonthlyV2() {
    const ARABIC_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

    console.log('بدء الترحيل (نسخة آمنة)...');
    const oldSnapshot = await db.collection('purchases').get();

    // نأخذ فقط الوثائق القديمة (لها حقل item مباشرة)
    const oldDocs = oldSnapshot.docs.filter(d => d.data().item !== undefined);
    console.log(`تم العثور على ${oldDocs.length} فاتورة قديمة للترحيل`);

    if (oldDocs.length === 0) {
        console.log('لا توجد فواتير قديمة بحاجة للترحيل. كل شيء جاهز ✅');
        return;
    }

    let migrated = 0;
    let failed = [];

    for (const oldDoc of oldDocs) {
        try {
            const data = oldDoc.data();
            const ts = data.timestamp ? data.timestamp.toDate() : new Date();
            const monthId = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`;
            const monthLabel = `${ARABIC_MONTHS[ts.getMonth()]} ${ts.getFullYear()}`;

            const monthRef = db.collection('purchases').doc(monthId);

            await monthRef.set({
                monthLabel: monthLabel,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            await monthRef.collection('invoices').add({
                category: data.category || '',
                item: data.item,
                quantity: data.quantity,
                totalPrice: data.totalPrice,
                supplier: data.supplier || '',
                timestamp: data.timestamp || firebase.firestore.Timestamp.fromDate(ts)
            });

            // حذف الفاتورة القديمة بعد نقلها بنجاح فقط
            await oldDoc.ref.delete();

            migrated++;
            console.log(`✅ (${migrated}/${oldDocs.length}) تم ترحيل: ${data.item} → شهر ${monthLabel}`);
        } catch (err) {
            failed.push({ id: oldDoc.id, item: (oldDoc.data() || {}).item, error: err.message });
            console.error(`❌ فشل ترحيل الفاتورة (${oldDoc.id} - ${(oldDoc.data() || {}).item}):`, err.message);
            console.warn('⏭️ تم تخطيها، سيتم المتابعة للفاتورة التالية...');
        }
    }

    console.log('=============================================');
    console.log(`اكتمل التشغيل. تم ترحيل ${migrated} من ${oldDocs.length} فاتورة بنجاح.`);
    if (failed.length > 0) {
        console.warn(`⚠️ فشل ترحيل ${failed.length} فاتورة (لم تُحذف من مكانها القديم، بياناتها آمنة):`);
        console.table(failed);
        console.log('يمكنك تشغيل نفس السكربت مرة أخرى لإعادة محاولة الفواتير الفاشلة فقط.');
    } else {
        console.log('اكتمل الترحيل بنجاح ✅ كل الفواتير انتقلت بدون أي مشاكل.');
    }
    console.log('=============================================');
})();
