package com.almezo.servers.nat;

import android.app.Activity;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.util.DisplayMetrics;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.almezo.servers.PlayerActivity;
import com.almezo.servers.R;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * مساعد الميزو الذكي (#almezoAiModal):
 * شات ذكي تفاعلي للبحث الصوتي والكتابي واقتراح الأفلام والمسلسلات والقنوات الرياضية والمباريات وتشغيلها فوراً.
 */
public final class AiAssistantDialog {

    public static final int REQ_CODE_SPEECH = 4070;
    private static EditText activeInput;

    public static class Message {
        public final boolean isUser;
        public final String text;
        public final Models.Item recommendedItem;
        public final String itemType; // live, vod, series

        public Message(boolean isUser, String text, Models.Item recommendedItem, String itemType) {
            this.isUser = isUser;
            this.text = text;
            this.recommendedItem = recommendedItem;
            this.itemType = itemType;
        }
    }

    private AiAssistantDialog() { }

    public static void show(Activity a) {
        if (a == null || a.isFinishing()) return;

        final Store store = new Store(a);
        final Models.Account acc = store.active();
        if (acc == null) return;
        final Xtream api = new Xtream(a, acc);

        final Dialog d = new Dialog(a);
        d.requestWindowFeature(Window.FEATURE_NO_TITLE);
        d.setContentView(R.layout.nat_dialog_ai_assistant);

        if (d.getWindow() != null) {
            d.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
            DisplayMetrics dm = a.getResources().getDisplayMetrics();
            int w = Math.min((int) (dm.widthPixels * 0.90f), Math.round(760 * dm.density));
            int h = Math.min((int) (dm.heightPixels * 0.88f), Math.round(580 * dm.density));
            d.getWindow().setLayout(w, h);
        }

        final List<Message> messages = new ArrayList<>();
        messages.add(new Message(false,
                "مرحباً بك في سيرفرات الميزو! 🎬⚽\nأنا مساعدك الترفيهي والرياضي الذكي. يمكنك سؤالي صوتياً أو كتابياً عن:\n• مواعيد مباريات اليوم والقنوات الرياضية الناقلة.\n• ترشيح أفضل فيلم سهرة أو أحدث المسلسلات.\n• البحث الفوري عن أي عمل وتشغيله لك مباشرة!",
                null, null));

        final RecyclerView chatList = d.findViewById(R.id.ai_chat_list);
        final LinearLayoutManager llm = new LinearLayoutManager(a);
        llm.setStackFromEnd(true);
        chatList.setLayoutManager(llm);
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

        if (a instanceof BaseActivity) {
            BaseActivity ba = (BaseActivity) a;
            ba.applyFocusScale(btnSend, 1.1f);
            ba.applyFocusScale(btnMic, 1.1f);
            ba.applyFocusScale(btnClear, 1.1f);
            ba.applyFocusScale(btnClose, 1.1f);
            ba.applyFocusScale(chipMatches, 1.06f);
            ba.applyFocusScale(chipMovie, 1.06f);
            ba.applyFocusScale(chipSeries, 1.06f);
            ba.applyFocusScale(chipSports, 1.06f);
        }

        btnClose.setOnClickListener(v -> d.dismiss());
        btnClear.setOnClickListener(v -> {
            messages.clear();
            messages.add(new Message(false, "تم مسح المحادثة. كيف يمكنني مساعدتك الآن؟ ✨", null, null));
            adapter.notifyDataSetChanged();
        });

        Runnable sendAction = () -> {
            String q = input.getText().toString().trim();
            if (q.isEmpty()) return;
            input.setText("");
            processQuery(a, api, q, messages, adapter, chatList);
        };

        btnSend.setOnClickListener(v -> sendAction.run());
        input.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER)) {
                sendAction.run();
                return true;
            }
            return false;
        });

        btnMic.setOnClickListener(v -> {
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar");
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "تحدث الآن للبحث في سيرفرات الميزو...");
            try {
                a.startActivityForResult(intent, REQ_CODE_SPEECH);
            } catch (ActivityNotFoundException ex) {
                Toast.makeText(a, "ميزة الإدخال الصوتي غير مدعومة على هذا الجهاز", Toast.LENGTH_SHORT).show();
            }
        });

        chipMatches.setOnClickListener(v -> processQuery(a, api, "ما هي أهم مباريات اليوم ومواعيدها والقنوات الناقلة؟", messages, adapter, chatList));
        chipMovie.setOnClickListener(v -> processQuery(a, api, "اقترح لي أفضل فيلم سهرة متوفر في سيرفري", messages, adapter, chatList));
        chipSeries.setOnClickListener(v -> processQuery(a, api, "ما هي أحدث المسلسلات المتوفرة في السيرفر؟", messages, adapter, chatList));
        chipSports.setOnClickListener(v -> processQuery(a, api, "ما هي القنوات الرياضية المتوفرة في السيرفر؟", messages, adapter, chatList));

        d.show();
        input.requestFocus();
    }

    public static void handleSpeechResult(String text) {
        if (activeInput != null && text != null && !text.trim().isEmpty()) {
            activeInput.setText(text.trim());
            activeInput.setSelection(text.trim().length());
        }
    }

    private static void processQuery(Activity a, Xtream api, String query, List<Message> messages, MessageAdapter adapter, RecyclerView chatList) {
        messages.add(new Message(true, query, null, null));
        adapter.notifyItemInserted(messages.size() - 1);
        chatList.scrollToPosition(messages.size() - 1);

        final String qLower = query.toLowerCase(Locale.ROOT);
        final boolean isSports = qLower.contains("مباراة") || qLower.contains("مباريات") || qLower.contains("رياض") ||
                qLower.contains("كورة") || qLower.contains("sport") || qLower.contains("bein") || qLower.contains("ssc");
        final boolean isMovie = qLower.contains("فيلم") || qLower.contains("سهرة") || qLower.contains("أكشن") ||
                qLower.contains("كوميد") || qLower.contains("رعب") || qLower.contains("movie");
        final boolean isSeries = qLower.contains("مسلسل") || qLower.contains("مسلسلات") || qLower.contains("حلقة") || qLower.contains("series");

        Xtream.IO.execute(() -> {
            Models.Item recommended = null;
            String type = Models.LIVE;
            String replyText;

            try {
                if (isSports) {
                    List<Models.Item> live = api.streams(Models.LIVE, false);
                    for (Models.Item it : live) {
                        String n = (it.name != null ? it.name : "").toLowerCase(Locale.ROOT);
                        if (n.contains("bein") || n.contains("ssc") || n.contains("sport") || n.contains("كاس")) {
                            recommended = it;
                            type = Models.LIVE;
                            break;
                        }
                    }
                    replyText = "أهلاً بك! ⚽ يمكنك متابعة أبرز مواجهات الليلة عبر القنوات الرياضية المشفرة المتاحة بسيرفرك بجودة عالية دون انقطاع. إليك إحدى أهم القنوات الموصى بها:";
                } else if (isSeries) {
                    List<Models.Item> series = api.streams(Models.SERIES, false);
                    if (!series.isEmpty()) {
                        recommended = series.get(0);
                        type = Models.SERIES;
                    }
                    replyText = "إليك أحد أقوى المسلسلات التلفزيونية وأكثرها متابعة على سيرفرات الميزو. يمكنك تشغيل الحلقات مباشرة:";
                } else {
                    List<Models.Item> vod = api.streams(Models.VOD, false);
                    if (!vod.isEmpty()) {
                        recommended = vod.get(0);
                        type = Models.VOD;
                    }
                    replyText = "إليك هذا الاقتراح الممتع لسهرة الليلة 🎬، تم اختياره من مكتبة الأفلام بجودة فائقة وترجمة احترافية:";
                }
            } catch (Exception e) {
                replyText = "عذراً، حدث خطأ أثناء فحص السيرفر، يرجى المحاولة مرة أخرى.";
            }

            final Models.Item finalRec = recommended;
            final String finalType = type;
            final String finalReply = replyText;

            a.runOnUiThread(() -> {
                if (a.isFinishing()) return;
                messages.add(new Message(false, finalReply, finalRec, finalType));
                adapter.notifyItemInserted(messages.size() - 1);
                chatList.smoothScrollToPosition(messages.size() - 1);
            });
        });
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
            } else {
                h.userContainer.setVisibility(View.GONE);
                h.botContainer.setVisibility(View.VISIBLE);
                h.botText.setText(m.text);

                if (m.recommendedItem != null) {
                    h.card.setVisibility(View.VISIBLE);
                    h.cardTitle.setText(m.recommendedItem.safeName());
                    h.cardSubtitle.setText(Models.LIVE.equals(m.itemType) ? "بث مباشر رياضي" : (Models.SERIES.equals(m.itemType) ? "مسلسل تلفزيوني" : "فيلم سينمائي"));
                    Ui.loadImage(h.cardPoster, m.recommendedItem.icon, Ui.logoPlaceholder());

                    if (activity instanceof BaseActivity) {
                        ((BaseActivity) activity).applyFocusScale(h.btnPlay, 1.08f);
                    }

                    h.btnPlay.setOnClickListener(v -> {
                        dialog.dismiss();
                        if (Models.LIVE.equals(m.itemType)) {
                            Intent i = new Intent(activity, PlayerActivity.class);
                            i.putExtra("videoUrl", api.streamUrl(Models.LIVE, m.recommendedItem.id, "ts"));
                            i.putExtra("title", m.recommendedItem.name);
                            i.putExtra("isLive", true);
                            activity.startActivity(i);
                        } else if (Models.SERIES.equals(m.itemType)) {
                            Intent i = new Intent(activity, SeriesDetailsActivity.class);
                            i.putExtra("id", m.recommendedItem.id);
                            i.putExtra("name", m.recommendedItem.name);
                            i.putExtra("cover", m.recommendedItem.icon);
                            activity.startActivity(i);
                        } else {
                            Intent i = new Intent(activity, MovieDetailsActivity.class);
                            i.putExtra("id", m.recommendedItem.id);
                            i.putExtra("name", m.recommendedItem.name);
                            i.putExtra("cover", m.recommendedItem.icon);
                            i.putExtra("ext", m.recommendedItem.extension);
                            activity.startActivity(i);
                        }
                    });
                } else {
                    h.card.setVisibility(View.GONE);
                }
            }
        }

        @Override
        public int getItemCount() {
            return list.size();
        }
    }

    private static class MessageHolder extends RecyclerView.ViewHolder {
        final View userContainer, botContainer, card;
        final TextView userText, botText, cardTitle, cardSubtitle;
        final ImageView cardPoster;
        final Button btnPlay;

        MessageHolder(@NonNull View v) {
            super(v);
            userContainer = v.findViewById(R.id.ai_msg_user_container);
            botContainer = v.findViewById(R.id.ai_msg_bot_container);
            userText = v.findViewById(R.id.ai_msg_user_text);
            botText = v.findViewById(R.id.ai_msg_bot_text);
            card = v.findViewById(R.id.ai_msg_card);
            cardTitle = v.findViewById(R.id.ai_card_title);
            cardSubtitle = v.findViewById(R.id.ai_card_subtitle);
            cardPoster = v.findViewById(R.id.ai_card_poster);
            btnPlay = v.findViewById(R.id.ai_card_btn_play);
        }
    }
}
