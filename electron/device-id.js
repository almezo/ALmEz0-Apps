// معرّف ثابت وفريد لجهاز الكمبيوتر، يستخدمه الحظر وسجلات غرفة المراقبة.
//
// البصمة القديمة في الويب كانت تُحسب من صفات عامة (دقة الشاشة، الأنوية، اللغة...)، فكانت
// كل أجهزة الكمبيوتر بنفس المواصفات تأخذ نفس البصمة، ويصيب حظر واحد منها الجميع.
// MachineGuid يولّده ويندوز عشوائياً عند تثبيته، ولا يتغيّر بإعادة تثبيت البرنامج ولا بمسح
// بياناته (يتغيّر فقط بإعادة تثبيت ويندوز نفسه).
//
// يُرسل مجزّأً (SHA-256) لا خاماً، بنفس تنسيق الويب والسيرفر: WG- ثم 32 خانة hex.
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const ARG_PREFIX = '--almezo-device-id=';
const ID_RE = /^WG-[A-F0-9]{32}$/;

function readMachineDeviceId() {
    if (process.platform !== 'win32') return '';
    try {
        // /reg:64 ضروري: برنامج 32-بت يُعاد توجيهه إلى WOW6432Node حيث لا يوجد MachineGuid
        const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 4000
        });
        const m = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/.exec(out);
        if (!m) return '';
        const hex = crypto.createHash('sha256')
            .update('almezo-device-v1:' + m[1].toLowerCase())
            .digest('hex').slice(0, 32).toUpperCase();
        return 'WG-' + hex;
    } catch (e) {
        // بلا معرّف: يولّد الويب معرّفاً عشوائياً بديلاً، ولا يتعطّل الإقلاع أبداً
        return '';
    }
}

/** يُستخدم في preload: يقرأ المعرّف من process.argv (يمرّره main عبر additionalArguments). */
function parseDeviceIdArg(argv) {
    const a = (argv || []).find((x) => typeof x === 'string' && x.startsWith(ARG_PREFIX));
    const v = a ? a.slice(ARG_PREFIX.length) : '';
    return ID_RE.test(v) ? v : '';
}

module.exports = { readMachineDeviceId, parseDeviceIdArg, ARG_PREFIX };
