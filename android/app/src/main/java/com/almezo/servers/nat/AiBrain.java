package com.almezo.servers.nat;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * عقل مساعد الميزو في المشغل الأصلي.
 *
 * لكل سؤال:
 * 1) فهم الطلب بالنموذج نفسه (نوعه، الأعمال أو القنوات المقصودة بالإنجليزية والعربية، التصنيف، اللغة)،
 *    حتى تُفهم اللهجات والأسماء المكتوبة بالعربية مثل "فيلم انسبشن".
 * 2) البحث في قوائم السيرفر النشط فعلياً (أفلام، مسلسلات، قنوات) عن المطابق والمناسب.
 * 3) إرسال النتائج مع معرفاتها للنموذج، مع بحث Google للمعلومات الخارجية (مواعيد المباريات والقناة الناقلة).
 * 4) النموذج يضع وسماً [[movie:ID]] بعد كل عمل يذكره من السيرفر، فتتحول إلى بطاقات تفتح صفحة الفيلم
 *    أو المسلسل أو تشغّل القناة. أي معرف غير موجود فعلاً في السيرفر يُتجاهل، فلا تظهر بطاقة لعمل وهمي.
 */
public final class AiBrain {

    private static final String MODEL = "gemini-2.5-flash";
    private static final int MAX_CARDS = 8;

    public static final class Card {
        public final String type;
        public final Models.Item item;
        Card(String type, Models.Item item) { this.type = type; this.item = item; }
    }

    public static final class Source {
        public final String title, uri;
        Source(String title, String uri) { this.title = title; this.uri = uri; }
    }

    public static final class Reply {
        public final String text;
        public final List<Card> cards;
        public final List<Source> sources;
        Reply(String text, List<Card> cards, List<Source> sources) {
            this.text = text;
            this.cards = cards;
            this.sources = sources;
        }
    }

    private final Context app;
    private final Xtream api;
    private final Models.Account account;
    private final AiClient client;
    private final String serverName;
    /** سجل المحادثة بصيغة Gemini (السؤال بدون بيانات السيرفر + الرد بوسومه)، آخر 8 رسائل. */
    private final List<JSONObject> history = new ArrayList<>();
    private final Random random = new Random();

    public AiBrain(Context ctx, Xtream api, Models.Account account) {
        this.app = ctx.getApplicationContext();
        this.api = api;
        this.account = account;
        this.client = new AiClient(ctx);
        Servers.Server s = Servers.find(account.serverCode);
        this.serverName = s != null ? s.name : "سيرفر العميل";
    }

    public void clearHistory() {
        synchronized (history) { history.clear(); }
    }

    public void restoreTurns(List<JSONObject> turns) {
        synchronized (history) {
            history.clear();
            if (turns != null) {
                history.addAll(turns);
                while (history.size() > 8) history.remove(0);
            }
        }
    }

    public static JSONObject createTurn(String role, String text) {
        try {
            return new JSONObject().put("role", role).put("parts",
                    new org.json.JSONArray().put(new JSONObject().put("text", text)));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    /** يُستدعى من خيط خلفي. */
    public Reply ask(String question) throws Exception {
        Catalog cat = new Catalog();
        JSONObject intent = understand(question);
        Map<String, Models.Item> known = new LinkedHashMap<>();
        String context = buildContext(question, intent, cat, known);

        JSONObject payload = new JSONObject();
        payload.put("model", MODEL);
        payload.put("systemInstruction", new JSONObject().put("parts",
                new JSONArray().put(new JSONObject().put("text", systemPrompt()))));
        JSONArray contents = new JSONArray();
        synchronized (history) {
            for (JSONObject h : history) contents.put(h);
        }
        contents.put(userTurn(context + "\n\nسؤال العميل: " + question));
        payload.put("contents", contents);
        payload.put("tools", new JSONArray().put(new JSONObject().put("googleSearch", new JSONObject())));
        payload.put("generationConfig", new JSONObject()
                .put("temperature", 0.7)
                .put("maxOutputTokens", 1200));

        JSONObject result = client.generate(payload);
        String raw = result.optString("text", "").trim();
        if (raw.isEmpty()) throw new Exception("empty reply");

        synchronized (history) {
            history.add(userTurn(question));
            history.add(new JSONObject().put("role", "model").put("parts",
                    new JSONArray().put(new JSONObject().put("text", raw))));
            while (history.size() > 8) history.remove(0);
        }

        List<Card> cards = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Matcher m = TAG.matcher(raw);
        while (m.find() && cards.size() < MAX_CARDS) {
            String key = m.group(1).toLowerCase(Locale.ROOT) + ":" + m.group(2).trim();
            Models.Item it = known.get(key);
            if (it == null) it = cat.lookup(m.group(1).toLowerCase(Locale.ROOT), m.group(2).trim());
            if (it != null && seen.add(key)) cards.add(new Card(m.group(1).toLowerCase(Locale.ROOT), it));
        }
        String text = TAG.matcher(raw).replaceAll("").replaceAll("[ \\t]+\\n", "\n").replaceAll("\\n{3,}", "\n\n").trim();

        List<Source> sources = new ArrayList<>();
        JSONArray src = result.optJSONArray("sources");
        if (src != null) {
            for (int i = 0; i < src.length(); i++) {
                JSONObject o = src.optJSONObject(i);
                if (o == null || o.optString("uri").isEmpty()) continue;
                sources.add(new Source(o.optString("title", o.optString("uri")), o.optString("uri")));
            }
        }
        return new Reply(text, cards, sources);
    }

    private static final Pattern TAG = Pattern.compile("\\[\\[\\s*(movie|series|channel)\\s*:\\s*([^\\]\\s]+)\\s*\\]\\]", Pattern.CASE_INSENSITIVE);

    private static JSONObject userTurn(String text) throws Exception {
        return new JSONObject().put("role", "user").put("parts",
                new JSONArray().put(new JSONObject().put("text", text)));
    }

    private String systemPrompt() {
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("Africa/Tripoli"));
        String now = String.format(Locale.US, "%04d-%02d-%02d %02d:%02d",
                c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH),
                c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE));
        return "أنت \"مساعد الميزو\"، مساعد ذكي داخل مشغل سيرفرات الميزو (ALmEz0) للأفلام والمسلسلات والقنوات المباشرة.\n"
                + "تحدث بالعربية بأسلوب طبيعي وودود وذكي، وافهم كل اللهجات (الليبية، المصرية، الخليجية، الشامية، المغاربية). "
                + "يمكنك الدردشة بحرية في أي موضوع ترفيهي أو رياضي أو عام يسأل عنه العميل.\n\n"
                + "مصادر معلوماتك:\n"
                + "1) \"بيانات سيرفر العميل\" المرفقة مع كل رسالة: هي المصدر الوحيد لما هو متوفر في سيرفره الحالي، مع معرّف كل عمل وقناة.\n"
                + "2) بحث Google: لكل معلومة من خارج السيرفر (مواعيد المباريات، القنوات الناقلة، النتائج، الأخبار، معلومات عن فيلم أو ممثل).\n\n"
                + "قواعد إلزامية:\n"
                + "- لا تقل أبداً إن عملاً أو قناة متوفرة إلا إذا وردت في بيانات سيرفر العميل المرفقة. إن لم تجدها فيها فقل بوضوح إنها غير متوفرة حالياً في السيرفر، ويمكنك اقتراح بديل متوفر من البيانات.\n"
                + "- بعد اسم كل فيلم أو مسلسل أو قناة تذكرها من بيانات السيرفر ضع وسمه كما هو في البيانات تماماً: [[movie:المعرف]] أو [[series:المعرف]] أو [[channel:المعرف]]. "
                + "التطبيق يحوّل الوسم إلى بطاقة تفتح صفحة الفيلم أو المسلسل أو تشغّل القناة. لا تخترع معرفاً ولا تضع وسماً لعمل غير موجود في البيانات.\n"
                + "- المباريات: ابحث في Google دائماً قبل الإجابة عن أي مباراة أو موعد أو قناة ناقلة، واذكر الموعد بتوقيت ليبيا/مصر (GMT+2) وبتوقيت مكة (GMT+3)، والبطولة، والقناة الناقلة الرسمية، "
                + "واذكر اسم الموقع الذي أخذت منه المعلومة. إن كانت القناة الناقلة ضمن قنوات السيرفر المرفقة فضع وسمها ليشغّلها العميل مباشرة.\n"
                + "- لا تخمّن ولا تؤلف معلومة: إن لم تجد معلومة مؤكدة فقل ذلك بصراحة (مثل: لم أجد موعداً مؤكداً لهذه المباراة).\n"
                + "- عند الاقتراح: اختر من بيانات السيرفر ما يطابق الطلب فعلاً (التصنيف، اللغة، البلد، المزاج)، ونوّع ولا تكرر نفس الأعمال في كل مرة، "
                + "واكتب لكل عمل سطراً صحيحاً مشوقاً (السنة، النوع، فكرة القصة بدون حرق). إن لم يكن في البيانات ما يطابق الطلب فقل ذلك.\n"
                + "- كن مختصراً ومنظماً: نقاط أو فقرات قصيرة، بلا مقدمات طويلة ولا تكرار لنفس الجمل بين الردود.\n\n"
                + "الوقت الآن بتوقيت ليبيا: " + now + ".";
    }

    // ------------------------------------------------------------------ فهم الطلب

    private JSONObject understand(String question) {
        try {
            StringBuilder prev = new StringBuilder();
            synchronized (history) {
                int from = Math.max(0, history.size() - 2);
                for (int i = from; i < history.size(); i++) {
                    JSONObject h = history.get(i);
                    String t = h.getJSONArray("parts").getJSONObject(0).optString("text", "");
                    if (t.length() > 600) t = t.substring(0, 600);
                    prev.append(h.optString("role")).append(": ").append(t).append('\n');
                }
            }
            String prompt = "You classify one message sent to the AI assistant inside an Arabic IPTV player app "
                    + "(movies, series, live TV channels, sports). Return only JSON.\n"
                    + "- intent: sports (matches, fixtures, results, which channel shows a game), availability (is a specific title or channel on the server), "
                    + "recommend (suggest something to watch), channel (find/play a TV channel), info (facts about a title, actor or story), chat (anything else).\n"
                    + "- type: movie, series, channel or any.\n"
                    + "- titles: specific titles or channel names the user means, each in its official original form (usually English) AND in Arabic when different. "
                    + "Example: \"فيلم انسبشن\" -> [\"Inception\",\"انسبشن\"]; \"قناة الجزيرة\" -> [\"Al Jazeera\",\"الجزيرة\"].\n"
                    + "- genres: subset of [action, adventure, animation, comedy, crime, documentary, drama, family, fantasy, history, horror, music, mystery, romance, scifi, thriller, war, western, biography, sport, kids].\n"
                    + "- language: arabic, english, turkish, indian, korean, japanese, spanish, french, or empty. (مصري/خليجي/سوري -> arabic, أجنبي/أمريكي -> english)\n"
                    + "- country: production country code if requested (us, uk, eg, sa, sy, tr, in, kr, jp, fr, es ...) else empty.\n"
                    + "- keywords: other useful search words (team, league, actor), may be empty.\n"
                    + "Use the previous conversation to resolve follow-ups like \"والمسلسلات؟\" or \"غيره\".\n\n"
                    + (prev.length() > 0 ? "Previous conversation:\n" + prev + "\n" : "")
                    + "Message: " + question;

            JSONObject schema = new JSONObject()
                    .put("type", "OBJECT")
                    .put("properties", new JSONObject()
                            .put("intent", new JSONObject().put("type", "STRING"))
                            .put("type", new JSONObject().put("type", "STRING"))
                            .put("titles", new JSONObject().put("type", "ARRAY").put("items", new JSONObject().put("type", "STRING")))
                            .put("genres", new JSONObject().put("type", "ARRAY").put("items", new JSONObject().put("type", "STRING")))
                            .put("language", new JSONObject().put("type", "STRING"))
                            .put("country", new JSONObject().put("type", "STRING"))
                            .put("keywords", new JSONObject().put("type", "ARRAY").put("items", new JSONObject().put("type", "STRING"))))
                    .put("required", new JSONArray().put("intent").put("type"));

            JSONObject payload = new JSONObject()
                    .put("model", MODEL)
                    .put("contents", new JSONArray().put(userTurn(prompt)))
                    .put("generationConfig", new JSONObject()
                            .put("temperature", 0)
                            .put("maxOutputTokens", 600)
                            .put("responseMimeType", "application/json")
                            .put("responseSchema", schema));
            String text = client.generate(payload).optString("text", "").trim();
            int a = text.indexOf('{'), b = text.lastIndexOf('}');
            if (a >= 0 && b > a) return new JSONObject(text.substring(a, b + 1));
        } catch (AiClient.AuthRequiredException e) {
            // يُعالج في الطلب الرئيسي برسالة واضحة
        } catch (Exception ignored) { }
        return guessIntent(question);
    }

    /** تخمين محلي بسيط إن تعذر فهم الطلب عبر النموذج. */
    private static JSONObject guessIntent(String q) {
        String n = BrowseActivity.normalize(q);
        String intent = "chat", type = "any";
        if (containsAny(n, "مباراه", "مباريات", "ماتش", "دوري", "كاس", "بطوله", "match", "league")) { intent = "sports"; type = "channel"; }
        else if (containsAny(n, "قناه", "قنوات", "channel")) { intent = "channel"; type = "channel"; }
        else if (containsAny(n, "مسلسل", "حلقه", "series")) { intent = "recommend"; type = "series"; }
        else if (containsAny(n, "فيلم", "افلام", "سهره", "movie")) { intent = "recommend"; type = "movie"; }
        try {
            return new JSONObject().put("intent", intent).put("type", type)
                    .put("titles", new JSONArray()).put("genres", new JSONArray(new ArrayList<>(Related.genres(q))))
                    .put("language", "").put("country", "").put("keywords", new JSONArray());
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private static boolean containsAny(String s, String... words) {
        for (String w : words) if (s.contains(w)) return true;
        return false;
    }

    // ------------------------------------------------------------------ بيانات السيرفر

    /** قوائم السيرفر النشط (من الكاش الذي حمّلته لوحة التحكم مسبقاً). */
    private final class Catalog {
        List<Models.Item> vod, series, live;
        Map<String, String> vodCats, seriesCats, liveCats;

        List<Models.Item> list(String type) {
            try {
                if (Models.VOD.equals(type)) { if (vod == null) vod = api.streams(Models.VOD, false); return vod; }
                if (Models.SERIES.equals(type)) { if (series == null) series = api.streams(Models.SERIES, false); return series; }
                if (live == null) live = api.streams(Models.LIVE, false);
                return live;
            } catch (Exception e) {
                return new ArrayList<>();
            }
        }

        Map<String, String> cats(String type) {
            Map<String, String> m = Models.VOD.equals(type) ? vodCats : Models.SERIES.equals(type) ? seriesCats : liveCats;
            if (m != null) return m;
            m = new LinkedHashMap<>();
            try {
                for (Models.Category c : api.categories(type, false)) m.put(c.id, c.name);
            } catch (Exception ignored) { }
            if (Models.VOD.equals(type)) vodCats = m;
            else if (Models.SERIES.equals(type)) seriesCats = m;
            else liveCats = m;
            return m;
        }

        Models.Item lookup(String tagType, String id) {
            String type = typeOfTag(tagType);
            for (Models.Item it : list(type)) if (id.equals(it.id)) return it;
            return null;
        }
    }

    private static String typeOfTag(String tag) {
        if ("movie".equals(tag)) return Models.VOD;
        if ("series".equals(tag)) return Models.SERIES;
        return Models.LIVE;
    }

    private static String tagOfType(String type) {
        if (Models.VOD.equals(type)) return "movie";
        if (Models.SERIES.equals(type)) return "series";
        return "channel";
    }

    private String buildContext(String question, JSONObject intent, Catalog cat, Map<String, Models.Item> known) {
        String kind = intent.optString("intent", "chat");
        String type = intent.optString("type", "any");
        List<String> titles = strings(intent.optJSONArray("titles"));
        List<String> keywords = strings(intent.optJSONArray("keywords"));
        Set<String> genres = new HashSet<>();
        for (String g : strings(intent.optJSONArray("genres"))) genres.addAll(Related.genres(g));
        String language = intent.optString("language", "").trim().toLowerCase(Locale.ROOT);
        String country = Related.country(intent.optString("country", ""));

        StringBuilder sb = new StringBuilder();
        sb.append("[بيانات سيرفر العميل: ").append(serverName).append("]\n");
        sb.append("- المحتوى الكلي: ").append(cat.list(Models.VOD).size()).append(" فيلم، ")
                .append(cat.list(Models.SERIES).size()).append(" مسلسل، ")
                .append(cat.list(Models.LIVE).size()).append(" قناة مباشرة.\n");

        boolean wantMovies = "movie".equals(type) || "any".equals(type);
        boolean wantSeries = "series".equals(type) || "any".equals(type);
        boolean wantLive = "channel".equals(type) || "sports".equals(kind) || "channel".equals(kind);

        // 1) أعمال أو قنوات محددة بالاسم
        List<String> searchTerms = new ArrayList<>(titles);
        if (searchTerms.isEmpty() && ("availability".equals(kind) || "info".equals(kind))) searchTerms.add(question);
        if (!searchTerms.isEmpty()) {
            sb.append("\n[نتائج البحث بالاسم في السيرفر]\n");
            String[] types = wantLive && !"any".equals(type) ? new String[]{Models.LIVE}
                    : "any".equals(type) ? new String[]{Models.VOD, Models.SERIES, Models.LIVE}
                    : new String[]{"movie".equals(type) ? Models.VOD : Models.SERIES};
            boolean any = false;
            for (String t : types) {
                List<Models.Item> found = new ArrayList<>();
                for (String term : searchTerms) {
                    for (Models.Item it : searchByName(cat.list(t), term, 5)) if (!found.contains(it)) found.add(it);
                }
                if (found.isEmpty()) continue;
                any = true;
                appendItems(sb, t, found.subList(0, Math.min(8, found.size())), cat, known);
            }
            if (!any) {
                sb.append("- لا يوجد في السيرفر أي عمل أو قناة بهذا الاسم: ").append(join(searchTerms)).append(".\n");
            }
        }

        // 2) مباريات: القنوات الرياضية المتوفرة لربط القناة الناقلة بقناة في السيرفر
        if ("sports".equals(kind)) {
            List<Models.Item> sports = sportsChannels(cat.list(Models.LIVE), keywords);
            sb.append("\n[القنوات الرياضية المتوفرة في السيرفر]\n");
            if (sports.isEmpty()) sb.append("- لا توجد قنوات رياضية في هذا السيرفر.\n");
            else appendItems(sb, Models.LIVE, sports, cat, known);
        } else if ("channel".equals(kind) && titles.isEmpty()) {
            List<Models.Item> found = new ArrayList<>();
            for (String k : keywords) for (Models.Item it : searchByName(cat.list(Models.LIVE), k, 10)) if (!found.contains(it)) found.add(it);
            for (Models.Item it : channelsInCategories(cat.list(Models.LIVE), cat.cats(Models.LIVE), keywords, 20)) if (!found.contains(it)) found.add(it);
            if (!found.isEmpty()) {
                sb.append("\n[قنوات مطابقة في السيرفر]\n");
                appendItems(sb, Models.LIVE, found.subList(0, Math.min(25, found.size())), cat, known);
            }
        }

        // 3) اقتراحات من السيرفر حسب النوع والتصنيف واللغة
        if ("recommend".equals(kind) || (("chat".equals(kind) || "info".equals(kind)) && !genres.isEmpty())) {
            if (wantMovies || !wantSeries) {
                sb.append("\n[أفلام مرشحة من السيرفر تناسب الطلب").append(describe(genres, language, country)).append("]\n");
                appendCandidates(sb, Models.VOD, genres, language, country, cat, known);
            }
            if (wantSeries) {
                sb.append("\n[مسلسلات مرشحة من السيرفر تناسب الطلب").append(describe(genres, language, country)).append("]\n");
                appendCandidates(sb, Models.SERIES, genres, language, country, cat, known);
            }
        }

        // أسماء الأقسام تساعد النموذج على الإجابة عن أسئلة عامة ("هل عندكم أفلام تركية؟")
        String catType = "movie".equals(type) ? Models.VOD : "series".equals(type) ? Models.SERIES : wantLive ? Models.LIVE : Models.VOD;
        List<String> catNames = new ArrayList<>(cat.cats(catType).values());
        if (!catNames.isEmpty()) {
            sb.append("\n- أقسام ").append(Models.VOD.equals(catType) ? "الأفلام" : Models.SERIES.equals(catType) ? "المسلسلات" : "القنوات")
                    .append(" في السيرفر: ").append(join(catNames.subList(0, Math.min(40, catNames.size())))).append(".\n");
        }
        return sb.toString();
    }

    private void appendCandidates(StringBuilder sb, String type, Set<String> genres, String language, String country,
                                  Catalog cat, Map<String, Models.Item> known) {
        List<Models.Item> pool = filterLanguage(cat.list(type), cat.cats(type), language);
        if (pool.isEmpty()) {
            sb.append("- لا يوجد في السيرفر محتوى بهذه اللغة.\n");
            return;
        }
        // الأحدث أولاً مع تقديم الأعلى تقييماً، ثم خلط خفيف حتى تتنوع الاقتراحات بين الطلبات
        List<Models.Item> recent = new ArrayList<>(pool);
        Collections.sort(recent, (a, b) -> Long.compare(b.added, a.added));
        List<Models.Item> ordered = new ArrayList<>(recent.subList(0, Math.min(400, recent.size())));
        Collections.sort(ordered, (a, b) -> Float.compare(b.rating, a.rating));
        List<Models.Item> head = new ArrayList<>(ordered.subList(0, Math.min(90, ordered.size())));
        Collections.shuffle(head, random);

        // أقسام السيرفر التي يدل اسمها على التصنيف المطلوب (مثل "رعب | Horror") تُفحص أعمالها أولاً
        List<Models.Item> candidates = new ArrayList<>();
        if (!genres.isEmpty()) {
            Set<String> genreCats = new HashSet<>();
            for (Map.Entry<String, String> c : cat.cats(type).entrySet()) {
                for (String g : Related.genres(c.getValue())) if (genres.contains(g)) { genreCats.add(c.getKey()); break; }
            }
            if (!genreCats.isEmpty()) {
                for (Models.Item it : recent) if (genreCats.contains(it.categoryId)) candidates.add(it);
                Collections.shuffle(candidates.subList(0, Math.min(60, candidates.size())), random);
            }
        }
        Set<Models.Item> added = new HashSet<>(candidates);
        for (Models.Item it : head) if (added.add(it)) candidates.add(it);
        for (Models.Item it : recent) if (added.add(it)) candidates.add(it);

        // قائمة المسلسلات تحمل التصنيف غالباً فيُفحص عدد كبير مجاناً، والأفلام تحتاج طلباً لكل فيلم
        int withGenre = 0;
        for (int i = 0; i < Math.min(50, recent.size()); i++) if (recent.get(i).genre != null && !recent.get(i).genre.isEmpty()) withGenre++;
        int maxChecks = withGenre >= 25 ? 400 : 64;

        List<Models.Item> picked = Related.rankByGenre(app, api, account.id, type, candidates, genres, country, null, 30, maxChecks);
        if (picked.isEmpty()) {
            sb.append("- لا يوجد في السيرفر ما يطابق هذا الطلب بدقة.\n");
            return;
        }
        appendItems(sb, type, picked, cat, known);
    }

    private static String describe(Set<String> genres, String language, String country) {
        StringBuilder d = new StringBuilder();
        if (!genres.isEmpty()) d.append(" | التصنيف: ").append(join(new ArrayList<>(genres)));
        if (!language.isEmpty()) d.append(" | اللغة: ").append(language);
        if (country != null) d.append(" | البلد: ").append(country);
        return d.toString();
    }

    private static void appendItems(StringBuilder sb, String type, List<Models.Item> items, Catalog cat, Map<String, Models.Item> known) {
        Map<String, String> cats = cat.cats(type);
        String label = Models.VOD.equals(type) ? "فيلم" : Models.SERIES.equals(type) ? "مسلسل" : "قناة";
        for (Models.Item it : items) {
            String key = tagOfType(type) + ":" + it.id;
            known.put(key, it);
            sb.append("- ").append(label).append(": \"").append(it.safeName()).append("\"");
            if (it.rating > 0) sb.append(" | التقييم ").append(Ui.ratingText(it.rating).replace("★ ", ""));
            String cn = it.categoryId != null ? cats.get(it.categoryId) : null;
            if (cn != null && !cn.isEmpty()) sb.append(" | القسم: ").append(cn);
            if (it.genre != null && !it.genre.trim().isEmpty()) sb.append(" | النوع: ").append(it.genre.trim());
            sb.append(" | الوسم: [[").append(key).append("]]\n");
        }
    }

    // ------------------------------------------------------------------ البحث

    /** مطابقة الاسم بعد التطبيع: الاسم كاملاً أو 75% من كلماته على الأقل. */
    static List<Models.Item> searchByName(List<Models.Item> list, String term, int limit) {
        String q = clean(term);
        List<String> words = new ArrayList<>();
        for (String w : q.split(" ")) if (w.length() >= 2 || w.matches("\\d")) words.add(w);
        if (words.isEmpty()) return new ArrayList<>();
        List<Models.Item> exact = new ArrayList<>(), strong = new ArrayList<>();
        for (Models.Item it : list) {
            String n = clean(it.safeName());
            if (n.isEmpty()) continue;
            if ((" " + n + " ").contains(" " + q + " ")) { exact.add(it); continue; }
            int hit = 0;
            for (String w : words) if ((" " + n + " ").contains(" " + w + " ")) hit++;
            if (words.size() >= 2 && hit * 4 >= words.size() * 3) strong.add(it);
        }
        Collections.sort(exact, (a, b) -> Integer.compare(a.safeName().length(), b.safeName().length()));
        List<Models.Item> out = new ArrayList<>(exact);
        for (Models.Item it : strong) if (!out.contains(it)) out.add(it);
        return new ArrayList<>(out.subList(0, Math.min(limit, out.size())));
    }

    private static String clean(String s) {
        return BrowseActivity.normalize(s)
                .replaceAll("\\b(4k|uhd|fhd|hd|sd|hevc|h265|1080p|720p|cam|vip)\\b", " ")
                .replaceAll("[^\\p{L}\\p{N} ]", " ")
                .replaceAll("^(فيلم|مسلسل|قناه|افلام)\\s+", "")
                .replaceAll("\\s+", " ").trim();
    }

    private static final String[] SPORT_WORDS = {"bein", "ssc", "alkass", "al kass", "كاس", "ad sport", "abu dhabi sport", "ابوظبي الرياض",
            "dubai sport", "دبي الرياض", "sharjah sport", "on time sport", "ontime sport", "starz sport", "sport", "رياض", "كوره"};

    /** القنوات الرياضية (نسخة واحدة لكل قناة بدون تكرار الجودات)، مع أولوية لما يطابق الكلمات المفتاحية. */
    private static List<Models.Item> sportsChannels(List<Models.Item> live, List<String> keywords) {
        Map<String, Models.Item> byBase = new LinkedHashMap<>();
        for (Models.Item it : live) {
            String n = BrowseActivity.normalize(it.safeName());
            if (!containsAny(n, SPORT_WORDS)) continue;
            String base = n.replaceAll("\\b(4k|uhd|fhd|hd|sd|hevc|h265|1080p|720p|low|\\+)\\b", " ").replaceAll("\\s+", " ").trim();
            if (!byBase.containsKey(base)) byBase.put(base, it);
        }
        List<Models.Item> all = new ArrayList<>(byBase.values());
        if (!keywords.isEmpty()) {
            List<Models.Item> first = new ArrayList<>();
            for (Models.Item it : all) {
                String n = BrowseActivity.normalize(it.safeName());
                for (String k : keywords) if (n.contains(BrowseActivity.normalize(k))) { first.add(it); break; }
            }
            all.removeAll(first);
            first.addAll(all);
            all = first;
        }
        return new ArrayList<>(all.subList(0, Math.min(45, all.size())));
    }

    private static List<Models.Item> channelsInCategories(List<Models.Item> live, Map<String, String> cats, List<String> keywords, int limit) {
        Set<String> ids = new HashSet<>();
        for (Map.Entry<String, String> e : cats.entrySet()) {
            String n = BrowseActivity.normalize(e.getValue());
            for (String k : keywords) if (!k.trim().isEmpty() && n.contains(BrowseActivity.normalize(k))) { ids.add(e.getKey()); break; }
        }
        List<Models.Item> out = new ArrayList<>();
        if (ids.isEmpty()) return out;
        for (Models.Item it : live) {
            if (ids.contains(it.categoryId)) out.add(it);
            if (out.size() >= limit) break;
        }
        return out;
    }

    private static final Map<String, String[]> LANGUAGE_CATS = new HashMap<>();
    static {
        LANGUAGE_CATS.put("arabic", new String[]{"arab", "عرب", "مصر", "خليج", "سوري", "لبنان", "مغرب", "عراق", "رمضان"});
        LANGUAGE_CATS.put("turkish", new String[]{"turk", "ترك"});
        LANGUAGE_CATS.put("indian", new String[]{"india", "hindi", "bollywood", "هند"});
        LANGUAGE_CATS.put("korean", new String[]{"korea", "كوري", "asia", "اسيو"});
        LANGUAGE_CATS.put("japanese", new String[]{"japan", "ياباني", "anime", "انمي"});
        LANGUAGE_CATS.put("spanish", new String[]{"spain", "spanish", "latino", "اسبان", "مكسيك"});
        LANGUAGE_CATS.put("french", new String[]{"france", "french", "فرنس"});
    }

    /** تصفية حسب اللغة: بأسماء الأقسام (عربي، تركي، هندي...) أو بحروف العنوان للعربي/الأجنبي. */
    private static List<Models.Item> filterLanguage(List<Models.Item> list, Map<String, String> cats, String language) {
        if (language == null || language.isEmpty()) return list;
        Set<String> langCats = new HashSet<>();
        Set<String> otherLangCats = new HashSet<>();
        for (Map.Entry<String, String[]> lang : LANGUAGE_CATS.entrySet()) {
            for (Map.Entry<String, String> c : cats.entrySet()) {
                String n = BrowseActivity.normalize(c.getValue());
                if (containsAny(n, lang.getValue())) {
                    if (lang.getKey().equals(language)) langCats.add(c.getKey());
                    else otherLangCats.add(c.getKey());
                }
            }
        }
        List<Models.Item> out = new ArrayList<>();
        for (Models.Item it : list) {
            boolean arabicName = Related.hasArabic(it.safeName());
            if ("arabic".equals(language)) {
                if (langCats.contains(it.categoryId) || arabicName) out.add(it);
            } else if ("english".equals(language)) {
                if (!arabicName && !otherLangCats.contains(it.categoryId)) out.add(it);
            } else if (langCats.contains(it.categoryId)) {
                out.add(it);
            }
        }
        return out;
    }

    private static List<String> strings(JSONArray arr) {
        List<String> out = new ArrayList<>();
        if (arr == null) return out;
        for (int i = 0; i < arr.length(); i++) {
            String s = arr.optString(i, "").trim();
            if (!s.isEmpty()) out.add(s);
        }
        return out;
    }

    private static String join(List<String> items) {
        StringBuilder sb = new StringBuilder();
        for (String s : items) {
            if (sb.length() > 0) sb.append("، ");
            sb.append(s);
        }
        return sb.toString();
    }
}
