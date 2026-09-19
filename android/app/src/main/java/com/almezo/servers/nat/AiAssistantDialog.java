package com.almezo.servers.nat;

import android.app.Activity;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.speech.RecognizerIntent;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.StyleSpan;
import android.util.DisplayMetrics;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.almezo.servers.PlayerActivity;
import com.almezo.servers.R;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * مساعد الميزو الذكي (#almezoAiModal) في المشغل الأصلي: محادثة حقيقية مع نموذج Gemini
 * تعرف محتوى السيرفر النشط، وتبحث في Google عن المباريات والمعلومات الخارجية، وتعرض بطاقات
 * تفتح صفحة الفيلم أو المسلسل أو تشغّل القناة مباشرة (انظر AiBrain).
 */
public final class AiAssistantDialog {

    public static final int REQ_CODE_SPEECH = 4070;
    private static Runnable pendingSpeechSend;
    private static EditText activeInput;

    static final class Message {
        final boolean isUser;
        final boolean pending;
        final String text;
        final List<AiBrain.Card> cards;
        final List<AiBrain.Source> sources;

        Message(boolean isUser, boolean pending, String text, List<AiBrain.Card> cards, List<AiBrain.Source> sources) {
            this.isUser = isUser;
            this.pending = pending;
            this.text = text;
            this.cards = cards;
            this.sources = sources;
        }

        static Message user(String text) {
            return new Message(true, false, text, Collections.emptyList(), Collections.emptyList());
        }

        static Message bot(String text) {
            return new Message(false, false, text, Collections.emptyList(), Collections.emptyList());
        }
    }

    private static final String WELCOME = "أهلاً بك في مساعد الميزو ✨\n"
            + "أعرف كل ما في سيرفرك الحالي من أفلام ومسلسلات وقنوات، وأبحث لك في الإنترنت عن مواعيد المباريات والقنوات الناقلة. جرّب مثلاً:\n"
            + "• اقترح لي فيلم أكشن للسهرة\n"
            + "• هل فيلم Inception متوفر؟\n"
            + "• متى مباراة ريال مدريد القادمة وعلى أي قناة؟";

    private AiAssistantDialog() { }

    public static void show(Activity a) {
        if (a == null || a.isFinishing()) return;

        final Store store = new Store(a);
        final Models.Account acc = store.active();
        if (acc == null) return;
        final Xtream api = new Xtream(a, acc);
        final AiBrain brain = new AiBrain(a, api, acc);

        final Dialog d = new Dialog(a);
        d.requestWindowFeature(Window.FEATURE_NO_TITLE);
        d.setContentView(R.layout.nat_dialog_ai_assistant);

        if (d.getWindow() != null) {
            d.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
            DisplayMetrics dm = a.getResources().getDisplayMetrics();
            int w, h;
            if (AppScale.isTouchMode(a)) {
                // الهاتف: نافذة تكاد تملأ الشاشة حتى لا تبدو المحادثة صغيرة
                w = Math.min((int) (dm.widthPixels * 0.92f), Math.round(1080 * dm.density));
                h = (int) (dm.heightPixels * 0.94f);
            } else {
                w = Math.min((int) (dm.widthPixels * 0.90f), Math.round(860 * dm.density));
                h = Math.min((int) (dm.heightPixels * 0.90f), Math.round(620 * dm.density));
            }
            d.getWindow().setLayout(w, h);
        }

        final List<Message> messages = new ArrayList<>();
        messages.add(Message.bot(WELCOME));

        final RecyclerView chatList = d.findViewById(R.id.ai_chat_list);
        final LinearLayoutManager llm = new LinearLayoutManager(a);
        llm.setStackFromEnd(true);
        chatList.setLayoutManager(llm);
        chatList.setItemAnimator(null);
        final MessageAdapter adapter = new MessageAdapter(a, messages, api, d);
        chatList.setAdapter(adapter);

        final EditText input = d.findViewById(R.id.ai_input_text);
        activeInput = input;
        final ImageButton btnSend = d.findViewById(R.id.ai_btn_send);
        final ImageButton btnMic = d.findViewById(R.id.ai_btn_mic);
        final ImageButton btnClear = d.findViewById(R.id.ai_btn_clear);
        final ImageButton btnClose = d.findViewById(R.id.ai_btn_close);

        final View chipMatches = d.findViewById(R.id.chip_matches);
        final View chipMovie = d.findViewById(R.id.chip_movie);
        final View chipSeries = d.findViewById(R.id.chip_series);
        final View chipSports = d.findViewById(R.id.chip_sports);

        for (View v : new View[]{btnSend, btnMic, btnClear, btnClose}) BaseActivity.applyFocusScale(v, 1.1f);
        for (View v : new View[]{chipMatches, chipMovie, chipSeries, chipSports}) BaseActivity.applyFocusScale(v, 1.06f);

        final boolean[] busy = {false};
        final Sender sender = q -> {
            if (busy[0] || q == null || q.trim().isEmpty()) return;
            busy[0] = true;
            ask(a, brain, q.trim(), messages, adapter, chatList, () -> busy[0] = false);
        };

        btnClose.setOnClickListener(v -> d.dismiss());
        btnClear.setOnClickListener(v -> {
            if (busy[0]) return;
            brain.clearHistory();
            messages.clear();
            messages.add(Message.bot("تم مسح المحادثة. كيف يمكنني مساعدتك الآن؟ ✨"));
            adapter.notifyDataSetChanged();
        });

        Runnable sendTyped = () -> {
            String q = input.getText().toString();
            if (q.trim().isEmpty() || busy[0]) return;
            input.setText("");
            sender.send(q);
        };
        btnSend.setOnClickListener(v -> sendTyped.run());
        input.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER)) {
                sendTyped.run();
                return true;
            }
            return false;
        });
        // بعد التحدث بالميكروفون يُرسل السؤال تلقائياً
        pendingSpeechSend = sendTyped;

        btnMic.setOnClickListener(v -> {
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar");
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "تحدث الآن واسأل مساعد الميزو...");
            try {
                a.startActivityForResult(intent, REQ_CODE_SPEECH);
            } catch (ActivityNotFoundException ex) {
                Toast.makeText(a, "ميزة الإدخال الصوتي غير مدعومة على هذا الجهاز", Toast.LENGTH_SHORT).show();
            }
        });

        chipMatches.setOnClickListener(v -> sender.send("ما هي أهم مباريات اليوم ومواعيدها والقنوات الناقلة لها؟"));
        chipMovie.setOnClickListener(v -> sender.send("اقترح لي فيلم سهرة ممتاز متوفر في سيرفري"));
        chipSeries.setOnClickListener(v -> sender.send("ما هي أحدث المسلسلات المتوفرة في سيرفري؟"));
        chipSports.setOnClickListener(v -> sender.send("ما هي القنوات الرياضية المتوفرة في سيرفري؟"));

        d.setOnDismissListener(di -> {
            if (activeInput == input) {
                activeInput = null;
                pendingSpeechSend = null;
            }
        });
        d.show();
        if (BaseActivity.isTvDevice(a)) chipMovie.requestFocus();
        else input.requestFocus();
    }

    private interface Sender {
        void send(String q);
    }

    public static void handleSpeechResult(String text) {
        if (activeInput != null && text != null && !text.trim().isEmpty()) {
            activeInput.setText(text.trim());
            activeInput.setSelection(text.trim().length());
            if (pendingSpeechSend != null) pendingSpeechSend.run();
        }
    }

    private static void ask(Activity a, AiBrain brain, String query, List<Message> messages, MessageAdapter adapter,
                            RecyclerView chatList, Runnable done) {
        messages.add(Message.user(query));
        messages.add(new Message(false, true, "⏳ جاري البحث في سيرفرك وتجهيز الإجابة...", Collections.emptyList(), Collections.emptyList()));
        adapter.notifyItemRangeInserted(messages.size() - 2, 2);
        chatList.scrollToPosition(messages.size() - 1);

        Xtream.IO.execute(() -> {
            Message reply;
            try {
                AiBrain.Reply r = brain.ask(query);
                reply = new Message(false, false, r.text, r.cards, r.sources);
            } catch (AiClient.AuthRequiredException e) {
                reply = Message.bot("لتفعيل مساعد الميزو افتح المشغل من داخل موقع الميزو بعد تسجيل الدخول في الموقع، ثم أعد السؤال.");
            } catch (Exception e) {
                reply = Message.bot("عذراً، تعذر الوصول إلى المساعد الآن. تحقق من اتصال الإنترنت وحاول مجدداً.");
            }
            final Message finalReply = reply;
            a.runOnUiThread(() -> {
                done.run();
                if (a.isFinishing()) return;
                int last = messages.size() - 1;
                if (last >= 0 && messages.get(last).pending) {
                    messages.set(last, finalReply);
                    adapter.notifyItemChanged(last);
                } else {
                    messages.add(finalReply);
                    adapter.notifyItemInserted(messages.size() - 1);
                }
                chatList.scrollToPosition(messages.size() - 1);
            });
        });
    }

    // ------------------------------------------------------------------ عرض الرسائل

    private static final Pattern BOLD = Pattern.compile("\\*\\*(.+?)\\*\\*");

    /** تنسيق بسيط لرد النموذج: **عريض**، والنقاط (* أو -) إلى •، والعناوين (#) عريضة. */
    static CharSequence renderMarkdown(String text) {
        StringBuilder plain = new StringBuilder();
        for (String line : text.split("\n", -1)) {
            String l = line;
            String t = l.trim();
            if (t.startsWith("#")) l = "**" + t.replaceFirst("^#+\\s*", "") + "**";
            else if (t.startsWith("* ") || t.startsWith("- ")) l = "• " + t.substring(2);
            if (plain.length() > 0) plain.append('\n');
            plain.append(l);
        }
        SpannableStringBuilder sb = new SpannableStringBuilder();
        Matcher m = BOLD.matcher(plain);
        int last = 0;
        while (m.find()) {
            sb.append(plain, last, m.start());
            int s = sb.length();
            sb.append(m.group(1));
            sb.setSpan(new StyleSpan(Typeface.BOLD), s, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            last = m.end();
        }
        sb.append(plain, last, plain.length());
        return sb;
    }

    private static class MessageAdapter extends RecyclerView.Adapter<MessageHolder> {
        private final Activity activity;
        private final List<Message> list;
        private final Xtream api;
        private final Dialog dialog;

        MessageAdapter(Activity activity, List<Message> list, Xtream api, Dialog dialog) {
            this.activity = activity;
            this.list = list;
            this.api = api;
            this.dialog = dialog;
        }

        @NonNull
        @Override
        public MessageHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.nat_item_ai_msg, parent, false);
            return new MessageHolder(v);
        }

        @Override
        public void onBindViewHolder(@NonNull MessageHolder h, int position) {
            Message m = list.get(position);
            if (m.isUser) {
                h.userContainer.setVisibility(View.VISIBLE);
                h.botContainer.setVisibility(View.GONE);
                h.userText.setText(m.text);
                return;
            }
            h.userContainer.setVisibility(View.GONE);
            h.botContainer.setVisibility(View.VISIBLE);
            h.botText.setText(renderMarkdown(m.text));
            h.botText.setAlpha(m.pending ? 0.7f : 1f);

            h.cards.removeAllViews();
            h.cards.setVisibility(m.cards.isEmpty() ? View.GONE : View.VISIBLE);
            LayoutInflater inf = LayoutInflater.from(h.itemView.getContext());
            for (AiBrain.Card c : m.cards) {
                View card = inf.inflate(R.layout.nat_item_ai_card, h.cards, false);
                bindCard(card, c);
                h.cards.addView(card);
            }

            h.sources.removeAllViews();
            h.sourcesBox.setVisibility(m.sources.isEmpty() ? View.GONE : View.VISIBLE);
            float dp = h.itemView.getResources().getDisplayMetrics().density;
            for (AiBrain.Source s : m.sources) {
                TextView chip = (TextView) inf.inflate(R.layout.nat_item_ai_source, h.sources, false);
                chip.setText(s.title);
                BaseActivity.applyFocusScale(chip, 1.06f);
                chip.setOnClickListener(v -> {
                    try {
                        activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(s.uri)));
                    } catch (Exception e) {
                        Toast.makeText(activity, "تعذر فتح المصدر", Toast.LENGTH_SHORT).show();
                    }
                });
                LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) chip.getLayoutParams();
                lp.setMarginEnd(Math.round(8 * dp));
                h.sources.addView(chip, lp);
            }
        }

        private void bindCard(View card, AiBrain.Card c) {
            Models.Item it = c.item;
            ImageView poster = card.findViewById(R.id.ai_card_poster);
            TextView title = card.findViewById(R.id.ai_card_title);
            TextView subtitle = card.findViewById(R.id.ai_card_subtitle);
            TextView action = card.findViewById(R.id.ai_card_action);
            boolean isLive = "channel".equals(c.type);
            poster.setScaleType(isLive ? ImageView.ScaleType.FIT_CENTER : ImageView.ScaleType.CENTER_CROP);
            Ui.loadImage(poster, it.icon, Ui.logoPlaceholder());
            title.setText(it.safeName());
            String kind = isLive ? "قناة مباشرة" : "series".equals(c.type) ? "مسلسل" : "فيلم";
            subtitle.setText(it.rating > 0 && !isLive ? kind + "  •  " + Ui.ratingText(it.rating) : kind);
            action.setText(isLive ? "▶ تشغيل القناة" : "series".equals(c.type) ? "صفحة المسلسل" : "صفحة الفيلم");
            BaseActivity.applyFocusScale(card, 1.03f);
            card.setOnClickListener(v -> open(c));
        }

        private void open(AiBrain.Card c) {
            Models.Item it = c.item;
            dialog.dismiss();
            Intent i;
            if ("channel".equals(c.type)) {
                i = new Intent(activity, PlayerActivity.class);
                i.putExtra("videoUrl", api.streamUrl(Models.LIVE, it.id, "m3u8"));
                i.putExtra("title", it.safeName());
                i.putExtra("posterUrl", it.icon == null ? "" : it.icon);
                i.putExtra("isLive", true);
                i.putExtra("isTv", BaseActivity.isTvDevice(activity));
            } else if ("series".equals(c.type)) {
                i = new Intent(activity, SeriesDetailsActivity.class);
                i.putExtra("id", it.id);
                i.putExtra("name", it.safeName());
                i.putExtra("cover", it.icon);
            } else {
                i = new Intent(activity, MovieDetailsActivity.class);
                i.putExtra("id", it.id);
                i.putExtra("name", it.safeName());
                i.putExtra("cover", it.icon);
                i.putExtra("ext", it.extension);
            }
            activity.startActivity(i);
        }

        @Override
        public int getItemCount() {
            return list.size();
        }
    }

    private static class MessageHolder extends RecyclerView.ViewHolder {
        final View userContainer, botContainer, sourcesBox;
        final TextView userText, botText;
        final LinearLayout cards, sources;

        MessageHolder(@NonNull View v) {
            super(v);
            userContainer = v.findViewById(R.id.ai_msg_user_container);
            botContainer = v.findViewById(R.id.ai_msg_bot_container);
            userText = v.findViewById(R.id.ai_msg_user_text);
            botText = v.findViewById(R.id.ai_msg_bot_text);
            cards = v.findViewById(R.id.ai_msg_cards);
            sources = v.findViewById(R.id.ai_msg_sources);
            sourcesBox = v.findViewById(R.id.ai_msg_sources_box);
        }
    }
}
