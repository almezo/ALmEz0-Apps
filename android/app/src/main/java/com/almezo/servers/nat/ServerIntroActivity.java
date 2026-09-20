package com.almezo.servers.nat;

/**
 * افتتاحية "جارٍ الاتصال بالسيرفر" — نفس تصميم الافتتاحية، لكن بشاشة مستقلة مُعلَنة
 * أفقية (sensorLandscape) في المانيفست.
 *
 * السبب: كانت تُفتح عبر HomeIntroActivity (بلا توجيه مفروض) ثم يفرض الكود الوضع الأفقي
 * بـsetRequestedOrientation بعد إنشائها، فيراها المستخدم طولية لأجزاء من الثانية ثم تدور.
 * الإعلان في المانيفست يجعل النظام يفتحها أفقية من أول إطار بلا أي دوران مرئي.
 */
public class ServerIntroActivity extends IntroActivity {
}
