// =====================================================================
// نظام النسخ الاحتياطي التلقائي - سيرفرات الميزو (ALmEz0)
// يشتغل كل ساعة تلقائياً ويحفظ كل شيء داخل Google Drive
// الخاص بحساب: almez0.servers@gmail.com
// =====================================================================

// ---------- الإعدادات (لازم تعبيها قبل التشغيل) ----------
const PROJECT_ID = 'almez0-servers';

// الصق هنا محتوى ملف الـ Service Account JSON كامل (من Firebase Console)
const SERVICE_ACCOUNT_KEY = {
  "client_email": "ضع_هنا_client_email",
  "private_key": "ضع_هنا_private_key_كامل_مع_-----BEGIN PRIVATE KEY-----"
};

const DRIVE_ROOT_FOLDER_NAME = 'نسخ احتياطية - سيرفرات الميزو';

// كلمة سر عشوائية طويلة، نفس القيمة بالضبط تحطها في backup-cron.php على السيرفر
const UPLOAD_SECRET = 'ضع_هنا_كلمة_سر_عشوائية_طويلة_وصعبة';

// كم يوم تحتفظ بالنسخ القديمة قبل حذفها تلقائياً (لتفادي امتلاء مساحة Drive)
const KEEP_DAYS = 30;


// ---------- توليد Access Token من الـ Service Account ----------
function getAccessToken_() {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: SERVICE_ACCOUNT_KEY.client_email,
    scope: [
      'https://www.googleapis.com/auth/datastore',
      'https://www.googleapis.com/auth/firebase.readonly',
      'https://www.googleapis.com/auth/cloud-platform.read-only'
    ].join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  const toSign = Utilities.base64EncodeWebSafe(JSON.stringify(header)) + '.' +
                 Utilities.base64EncodeWebSafe(JSON.stringify(claimSet));
  const signature = Utilities.computeRsaSha256Signature(toSign, SERVICE_ACCOUNT_KEY.private_key);
  const jwt = toSign + '.' + Utilities.base64EncodeWebSafe(signature);

  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    },
    muteHttpExceptions: true
  });
  const json = JSON.parse(response.getContentText());
  if (!json.access_token) throw new Error('فشل الحصول على Access Token: ' + response.getContentText());
  return json.access_token;
}

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// ---------- المهمة الرئيسية (تُستدعى تلقائياً كل ساعة) ----------
function hourlyBackup() {
  const root = getOrCreateFolder_(DriveApp, DRIVE_ROOT_FOLDER_NAME);
  const stamp = Utilities.formatDate(new Date(), 'GMT+2', "yyyy-MM-dd_HH'-00'");
  const runFolder = getOrCreateFolder_(root, stamp);

  backupFirestoreData_(runFolder);
  backupFirestoreRules_(runFolder);
  cleanupOldBackups_(root);
}

// ---------- نسخ كل بيانات Firestore (كل الكولكشنز، متداخلة بالكامل) ----------
function backupFirestoreData_(folder) {
  const token = getAccessToken_();
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

  function listCollections(parentPath) {
    const url = (parentPath ? `${baseUrl}/${parentPath}` : baseUrl) + ':listCollectionIds';
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: { Authorization: 'Bearer ' + token },
      contentType: 'application/json',
      payload: JSON.stringify({ pageSize: 300 }),
      muteHttpExceptions: true
    });
    const json = JSON.parse(res.getContentText());
    return json.collectionIds || [];
  }

  function fetchAllDocs(collectionPath) {
    let docs = [];
    let pageToken = null;
    do {
      let url = `${baseUrl}/${collectionPath}?pageSize=300`;
      if (pageToken) url += '&pageToken=' + pageToken;
      const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
      const json = JSON.parse(res.getContentText());
      docs = docs.concat(json.documents || []);
      pageToken = json.nextPageToken || null;
    } while (pageToken);
    return docs;
  }

  function dumpCollectionTree(collectionPath) {
    const result = {};
    const docs = fetchAllDocs(collectionPath);
    docs.forEach(doc => {
      const docId = doc.name.split('/').pop();
      const docRelPath = collectionPath + '/' + docId;
      const subCols = listCollections(docRelPath);
      const entry = { fields: doc.fields || {} };
      subCols.forEach(sub => {
        entry[sub] = dumpCollectionTree(docRelPath + '/' + sub);
      });
      result[docId] = entry;
    });
    return result;
  }

  const topCollections = listCollections('');
  const fullDump = {};
  topCollections.forEach(col => {
    fullDump[col] = dumpCollectionTree(col);
  });

  folder.createFile('firestore-data.json', JSON.stringify(fullDump), MimeType.PLAIN_TEXT);
}

// ---------- نسخ قواعد الأمان الحالية (Firestore Security Rules) ----------
function backupFirestoreRules_(folder) {
  const token = getAccessToken_();

  const releaseUrl = `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases/cloud.firestore`;
  const releaseRes = UrlFetchApp.fetch(releaseUrl, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  const releaseJson = JSON.parse(releaseRes.getContentText());
  const rulesetName = releaseJson.rulesetName;
  if (!rulesetName) return;

  const rulesetRes = UrlFetchApp.fetch(`https://firebaserules.googleapis.com/v1/${rulesetName}`, {
    headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
  });
  const rulesetJson = JSON.parse(rulesetRes.getContentText());
  const rulesContent = (rulesetJson.source && rulesetJson.source.files && rulesetJson.source.files[0])
    ? rulesetJson.source.files[0].content : '';

  folder.createFile('firestore.rules', rulesContent || '', MimeType.PLAIN_TEXT);
}

// ---------- حذف النسخ الأقدم من KEEP_DAYS يوم ----------
function cleanupOldBackups_(root) {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000);
  const it = root.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getDateCreated() < cutoff) f.setTrashed(true);
  }
}

// ---------- نقطة استقبال ملف الموقع المضغوط (zip) من سكربت PHP على السيرفر ----------
function doPost(e) {
  try {
    if (!e.parameter.secret || e.parameter.secret !== UPLOAD_SECRET) {
      return ContentService.createTextOutput('Unauthorized').setMimeType(ContentService.MimeType.TEXT);
    }

    const root = getOrCreateFolder_(DriveApp, DRIVE_ROOT_FOLDER_NAME);
    const stamp = Utilities.formatDate(new Date(), 'GMT+2', "yyyy-MM-dd_HH'-00'");
    const runFolder = getOrCreateFolder_(root, stamp);

    const blob = e.files && e.files.file ? e.files.file : null;
    if (!blob) return ContentService.createTextOutput('No file received').setMimeType(ContentService.MimeType.TEXT);

    runFolder.createFile(blob);
    return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput('Error: ' + err.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

// ---------- شغّل هذي الدالة يدوياً مرة واحدة فقط بعد ضبط الإعدادات فوق ----------
function setupHourlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('hourlyBackup').timeBased().everyHours(1).create();
  Logger.log('تم ضبط النسخ الاحتياطي التلقائي كل ساعة بنجاح ✅');
}

// ---------- دالة اختبار يدوية (شغّلها للتأكد إن كل شيء يعمل قبل تفعيل المؤقت) ----------
function testBackupNow() {
  hourlyBackup();
  Logger.log('تم تنفيذ نسخة احتياطية تجريبية بنجاح ✅ - تحقق من Google Drive');
}
