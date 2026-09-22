/**
 * إعدادات مساعد الميزو الذكي (AlMeZ0 AI Assistant)
 *
 * تعليمات المساعد وفهم السؤال وإعدادات النموذج أصبحت في السيرفر (generateAiReply في
 * functions/index.js) كعقل مشترك مع مشغل أندرويد، فيرد البرنامجان بنفس المستوى وتُحسَّن
 * الردود دون إصدار نسخة جديدة. مفتاح Gemini على الخادم فقط.
 */
window.ALMEZ0_AI_CONFIG = {
    model: "gemini-2.5-flash"
};
var ALMEZ0_AI_CONFIG = window.ALMEZ0_AI_CONFIG;
