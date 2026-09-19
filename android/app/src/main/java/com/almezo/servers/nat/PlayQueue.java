package com.almezo.servers.nat;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * قائمة التشغيل الحالية للمشغل: قنوات القسم المفتوح (للتنقل بين القنوات بالريموت) أو حلقات
 * الموسم (للحلقة التالية). تُحفظ في الذاكرة بدل تمريرها داخل الـ Intent، لأن قسماً واحداً قد يضم
 * آلاف القنوات ويتجاوز حد حجم بيانات الـ Intent.
 */
public final class PlayQueue {

    public static final class Entry {
        public final String url, title, icon, key, streamId, type;

        public Entry(String url, String title, String icon, String key, String streamId, String type) {
            this.url = url;
            this.title = title;
            this.icon = icon;
            this.key = key;
            this.streamId = streamId;
            this.type = type;
        }
    }

    private static List<Entry> entries = Collections.emptyList();
    private static int index = 0;

    private PlayQueue() { }

    public static synchronized void set(List<Entry> list, int start) {
        entries = new ArrayList<>(list);
        index = Math.max(0, Math.min(start, entries.size() - 1));
    }

    public static synchronized void single(Entry e) {
        List<Entry> l = new ArrayList<>();
        l.add(e);
        set(l, 0);
    }

    public static synchronized List<Entry> entries() {
        return entries;
    }

    public static synchronized int index() {
        return index;
    }

    public static synchronized void setIndex(int i) {
        if (!entries.isEmpty()) index = ((i % entries.size()) + entries.size()) % entries.size();
    }

    public static synchronized Entry current() {
        return entries.isEmpty() ? null : entries.get(index);
    }
}
