package com.almezo.servers.nat;

/** نماذج بيانات خفيفة جداً (حقول قليلة فقط) لتقليل استهلاك الذاكرة مع عشرات آلاف العناصر. */
public final class Models {

    private Models() { }

    public static final String LIVE = "live";
    public static final String VOD = "vod";
    public static final String SERIES = "series";

    public static final class Category {
        public final String id;
        public final String name;
        public int count;
        /** أقسام خاصة: الكل، المفضلة، متابعة المشاهدة، المضافة حديثاً */
        public final boolean special;

        public Category(String id, String name, int count, boolean special) {
            this.id = id;
            this.name = name;
            this.count = count;
            this.special = special;
        }
    }

    public static final class Item {
        /** stream_id للقنوات والأفلام، series_id للمسلسلات */
        public String id;
        public String name;
        public String icon;
        public String categoryId;
        public String extension;
        public float rating;
        public long added;

        public String safeName() {
            return name == null ? "" : name;
        }
    }

    public static final class Account {
        public String id;
        public String serverCode;
        public String host;
        public String username;
        public String password;
        public String userInfoJson;
        public long savedAt;
    }
}
