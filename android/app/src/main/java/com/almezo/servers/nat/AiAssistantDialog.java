package com.almezo.servers.nat;

import android.animation.Animator;
import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.net.Uri;
import android.speech.RecognizerIntent;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.StyleSpan;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * مساعد الميزو الذكي (#almezoAiModal) في المشغل الأصلي: محادثة حقيقية مع نموذج Gemini
 * تعرف محتوى السيرفر النشط، وسجل المحادثات السابقة، ومؤشر تحميل متحرك على طريقة جيميناي.
 */
public final class AiAssistantDialog {

    public static final int REQ_CODE_SPEECH = 4070;
    private static Runnable pendingSpeechSend;
    private static EditText activeInput;

    private static final String PREF_HISTORY = "almezo_ai_history";
    private static final String KEY_SESSIONS = "sessions";
    private static final SimpleDateFormat DATE_FORMAT = new SimpleDateFormat("d/M HH:mm", Locale.getDefault());

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

    static final class Session {
        String id;
        String title;
        long createdAt;
        final List<Message> messages = new ArrayList<>();

        Session(String id, String title, long createdAt) {
            this.id = id;
            this.title = title;
            this.createdAt = createdAt;
        }

        JSONObject toJson() {
            try {
                JSONObject obj = new JSONObject();
                obj.put("id", id);
                obj.put("title", title);
                obj.put("createdAt", createdAt);
                JSONArray msgs = new JSONArray();
                for (Message m : messages) {
                    if (m.pending) continue;
                    JSONObject mo = new JSONObject();
                    mo.put("isUser", m.isUser);
                    mo.put("text", m.text);
                    msgs.put(mo);
                }
                obj.put("messages", msgs);
                return obj;
            } catch (Exception e) {
                return null;
            }
        }

        static Session fromJson(JSONObject obj) {
            if (obj == null) return null;
            String id = obj.optString("id");
            String title = obj.optString("title", "محادثة");
            long createdAt = obj.optLong("createdAt", System.currentTimeMillis());
            Session s = new Session(id, title, createdAt);
            JSONArray msgs = obj.optJSONArray("messages");
            if (msgs != null) {
                for (int i = 0; i < msgs.length(); i++) {
                    JSONObject mo = msgs.optJSONObject(i);
                    if (mo == null) continue;
                    boolean isUser = mo.optBoolean("isUser", false);
                    String text = mo.optString("text", "");
                    s.messages.add(new Message(isUser, false, text, Collections.emptyList(), Collections.emptyList()));
                }
            }
            return s;
        }
    }

    private static List<Session> loadSessions(Context ctx) {
        List<Session> list = new ArrayList<>();
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREF_HISTORY, Context.MODE_PRIVATE);
            String raw = sp.getString(KEY_SESSIONS, "[]");
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                Session s = Session.fromJson(arr.optJSONObject(i));
                if (s != null) list.add(s);
            }
        } catch (Exception ignored) { }
        return list;
    }

    private static void saveSessions(Context ctx, List<Session> sessions) {
        try {
            JSONArray arr = new JSONArray();
            for (Session s : sessions) {
                JSONObject o = s.toJson();
                if (o != null) arr.put(o);
            }
            SharedPreferences sp = ctx.getSharedPreferences(PREF_HISTORY, Context.MODE_PRIVATE);
            sp.edit().putString(KEY_SESSIONS, arr.toString()).apply();
        } catch (Exception ignored) { }
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

        final Dialog d = new NatDialog(a);
        d.setContentView(R.layout.nat_dialog_ai_assistant);

        if (d.getWindow() != null) {
            d.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE | WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
            DisplayMetrics dm = a.getResources().getDisplayMetrics();
            int w, h;
            if (AppScale.isTouchMode(a)) {
                // الهاتف: نافذة تملأ معظم الشاشة حتى تبدو المحادثة مريحة وواضحة
                w = Math.min((int) (dm.widthPixels * 0.94f), Math.round(1080 * dm.density));
                h = (int) (dm.heightPixels * 0.95f);
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
        final ImageButton btnHistory = d.findViewById(R.id.ai_btn_history);

        final View historyDrawer = d.findViewById(R.id.ai_history_drawer);
        final TextView btnNewChat = d.findViewById(R.id.ai_btn_new_chat);
        final TextView historyEmpty = d.findViewById(R.id.ai_history_empty);
        final RecyclerView historyList = d.findViewById(R.id.ai_history_list);

        if (historyDrawer != null) {
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) historyDrawer.getLayoutParams();
            DisplayMetrics dm = a.getResources().getDisplayMetrics();
            lp.width = Math.min((int) (dm.widthPixels * 0.78f), Math.round(300 * dm.density));
            lp.gravity = Gravity.START | Gravity.TOP;
            historyDrawer.setLayoutParams(lp);
        }

        final List<Session> allSessions = loadSessions(a);
        final Session[] currentSession = {null};

        final View chipMatches = d.findViewById(R.id.chip_matches);
        final View chipMovie = d.findViewById(R.id.chip_movie);
        final View chipSeries = d.findViewById(R.id.chip_series);
        final View chipSports = d.findViewById(R.id.chip_sports);

        for (View v : new View[]{btnSend, btnMic, btnClear, btnClose, btnHistory}) {
            if (v != null) BaseActivity.applyFocusScale(v, 1.1f);
        }
        if (btnNewChat != null) BaseActivity.applyFocusScale(btnNewChat, 1.08f);
        for (View v : new View[]{chipMatches, chipMovie, chipSeries, chipSports}) {
            if (v != null) BaseActivity.applyFocusScale(v, 1.06f);
        }

        // إخفاء لوحة المفاتيح تلقائياً عند الإرسال أو الضغط على الاقتراحات
        final Runnable hideKeyboard = () -> {
            try {
                InputMethodManager imm = (InputMethodManager) a.getSystemService(Context.INPUT_METHOD_SERVICE);
                if (imm != null) {
                    if (input != null) imm.hideSoftInputFromWindow(input.getWindowToken(), 0);
                    View focus = a.getCurrentFocus();
                    if (focus != null) imm.hideSoftInputFromWindow(focus.getWindowToken(), 0);
                }
            } catch (Exception ignored) { }
            if (input != null) input.clearFocus();
        };

        // محول قائمة سجل المحادثات
        final HistoryAdapter historyAdapter = new HistoryAdapter(a, allSessions, currentSession, new HistoryListener() {
            @Override
            public void onSelect(Session session) {
                currentSession[0] = session;
                messages.clear();
                if (session.messages.isEmpty()) {
                    messages.add(Message.bot("محادثة فارغة. كيف يمكنني مساعدتك؟ ✨"));
                } else {
                    messages.addAll(session.messages);
                }
                adapter.notifyDataSetChanged();
                chatList.scrollToPosition(messages.size() - 1);

                // استعادة سياق المحادثة في عقل النموذج
                List<JSONObject> turns = new ArrayList<>();
                for (Message m : session.messages) {
                    turns.add(AiBrain.createTurn(m.isUser ? "user" : "model", m.text));
                }
                brain.restoreTurns(turns);

                if (historyDrawer != null) historyDrawer.setVisibility(View.GONE);
                hideKeyboard.run();
            }

            @Override
            public void onDelete(Session session) {
                allSessions.remove(session);
                saveSessions(a, allSessions);
                if (historyEmpty != null) {
                    historyEmpty.setVisibility(allSessions.isEmpty() ? View.VISIBLE : View.GONE);
                }
                if (currentSession[0] != null && session.id.equals(currentSession[0].id)) {
                    currentSession[0] = null;
                    brain.clearHistory();
                    messages.clear();
                    messages.add(Message.bot(WELCOME));
                    adapter.notifyDataSetChanged();
                }
            }
        });

        if (historyList != null) {
            historyList.setLayoutManager(new LinearLayoutManager(a));
            historyList.setAdapter(historyAdapter);
        }

        final boolean[] busy = {false};
        final Sender sender = q -> {
            if (busy[0] || q == null || q.trim().isEmpty()) return;
            busy[0] = true;
            chatList.postDelayed(() -> busy[0] = false, 35000);
            hideKeyboard.run();

            // حفظ السؤال في الجلسة النشطة أو إنشاء جلسة جديدة
            String trimmed = q.trim();
            if (currentSession[0] == null) {
                String title = trimmed.length() > 36 ? trimmed.substring(0, 36) + "..." : trimmed;
                Session newSession = new Session("session_" + System.currentTimeMillis(), title, System.currentTimeMillis());
                allSessions.add(0, newSession);
                currentSession[0] = newSession;
            }
            currentSession[0].messages.add(Message.user(trimmed));
            saveSessions(a, allSessions);

            ask(a, brain, trimmed, messages, adapter, chatList, replyMsg -> {
                busy[0] = false;
                if (currentSession[0] != null && replyMsg != null) {
                    currentSession[0].messages.add(replyMsg);
                    saveSessions(a, allSessions);
                }
            });
        };

        btnClose.setOnClickListener(v -> d.dismiss());
        btnClear.setOnClickListener(v -> {
            if (busy[0]) return;
            brain.clearHistory();
            currentSession[0] = null;
            messages.clear();
            messages.add(Message.bot("تم مسح المحادثة. كيف يمكنني مساعدتك الآن؟ ✨"));
            adapter.notifyDataSetChanged();
            hideKeyboard.run();
        });

        // زر سجل المحادثات في الترويسة (مطابق للصورة 1)
        if (btnHistory != null) {
            btnHistory.setOnClickListener(v -> {
                hideKeyboard.run();
                if (historyDrawer != null) {
                    boolean visible = historyDrawer.getVisibility() == View.VISIBLE;
                    if (!visible) {
                        historyAdapter.notifyDataSetChanged();
                        if (historyEmpty != null) {
                            historyEmpty.setVisibility(allSessions.isEmpty() ? View.VISIBLE : View.GONE);
                        }
                        historyDrawer.setVisibility(View.VISIBLE);
                    } else {
                        historyDrawer.setVisibility(View.GONE);
                    }
                }
            });
        }

        // زر "+ جديدة" في درج السجل (مطابق للصورة 2)
        if (btnNewChat != null) {
            btnNewChat.setOnClickListener(v -> {
                currentSession[0] = null;
                brain.clearHistory();
                messages.clear();
                messages.add(Message.bot("بدأنا محادثة جديدة! 🎬⚽ تفضل بسؤالي عن أي فيلم، مسلسل، أو مواعيد المباريات."));
                adapter.notifyDataSetChanged();
                if (historyDrawer != null) historyDrawer.setVisibility(View.GONE);
                hideKeyboard.run();
            });
        }

        Runnable sendTyped = () -> {
            String q = input.getText().toString();
            if (q.trim().isEmpty() || busy[0]) return;
            input.setText("");
            sender.send(q);
        };
        btnSend.setOnClickListener(v -> sendTyped.run());
        input.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND
                    || actionId == EditorInfo.IME_ACTION_DONE
                    || actionId == EditorInfo.IME_ACTION_GO
                    || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_DOWN)) {
                sendTyped.run();
                return true;
            }
            return false;
        });
        // إغلاق سجل المحادثات إذا تم لمس قائمة الشات
        chatList.setOnTouchListener((v, ev) -> {
            if (historyDrawer != null && historyDrawer.getVisibility() == View.VISIBLE) {
                historyDrawer.setVisibility(View.GONE);
            }
            return false;
        });
        // إغلاق سجل المحادثات بزر الرجوع دون إغلاق المساعد بالكامل
        d.setOnKeyListener((di, keyCode, ev) -> {
            if (keyCode == KeyEvent.KEYCODE_BACK && ev.getAction() == KeyEvent.ACTION_UP) {
                if (historyDrawer != null && historyDrawer.getVisibility() == View.VISIBLE) {
                    historyDrawer.setVisibility(View.GONE);
                    return true;
                }
            }
            return false;
        });
        // بعد التحدث بالميكروفون يُرسل السؤال تلقائياً وتغلق لوحة المفاتيح
        pendingSpeechSend = sendTyped;

        btnMic.setOnClickListener(v -> {
            hideKeyboard.run();
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar");
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "تحدث الآن واسأل مساعد الميزو...");
            try {
                a.startActivityForResult(intent, REQ_CODE_SPEECH);
            } catch (ActivityNotFoundException ex) {
                Ui.toast(a, "ميزة الإدخال الصوتي غير مدعومة على هذا الجهاز");
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
        if (BaseActivity.isTvDevice(a)) {
            chipMovie.requestFocus();
        } else {
            if (input != null) input.clearFocus();
        }
    }

    private interface Sender {
        void send(String q);
    }

    private interface ReplyCallback {
        void onReply(Message msg);
    }

    public static void handleSpeechResult(String text) {
        if (activeInput != null && text != null && !text.trim().isEmpty()) {
            activeInput.setText(text.trim());
            activeInput.setSelection(text.trim().length());
            if (pendingSpeechSend != null) pendingSpeechSend.run();
        }
    }

    private static void ask(Activity a, AiBrain brain, String query, List<Message> messages, MessageAdapter adapter,
                            RecyclerView chatList, ReplyCallback callback) {
        messages.add(Message.user(query));
        // وضع الانتظار بدون نص ثابت، بل عبر مؤشر التحميل المتحرك على نمط جيميناي
        messages.add(new Message(false, true, "", Collections.emptyList(), Collections.emptyList()));
        adapter.notifyItemRangeInserted(messages.size() - 2, 2);
        chatList.scrollToPosition(messages.size() - 1);

        Xtream.IO.execute(() -> {
            Message reply;
            try {
                AiBrain.Reply r = brain.ask(query);
                reply = new Message(false, false, r.text, r.cards, r.sources);
            } catch (AiClient.AuthRequiredException e) {
                reply = Message.bot("لتفعيل مساعد الميزو افتح المشغل من داخل موقع الميزو بعد تسجيل الدخول في الموقع، ثم أعد السؤال.");
            } catch (AiClient.QuotaException e) {
                android.util.Log.w("AiAssistantDialog", "AI quota exhausted");
                reply = Message.bot("مساعد الميزو وصل للحد المسموح من الطلبات حالياً. أعد المحاولة بعد قليل. 🙏");
            } catch (AiBrain.EmptyReplyException e) {
                android.util.Log.w("AiAssistantDialog", "AI empty reply");
                reply = Message.bot("لم يصلني رد مكتمل هذه المرة. جرّب إعادة صياغة السؤال أو أعد إرساله.");
            } catch (Throwable e) {
                android.util.Log.e("AiAssistantDialog", "AI ask error", e);
                reply = Message.bot("عذراً، تعذر الوصول إلى المساعد الآن. تحقق من اتصال الإنترنت وحاول مجدداً.");
            }
            final Message finalReply = reply;
            a.runOnUiThread(() -> {
                try {
                    callback.onReply(finalReply);
                } catch (Throwable t) {
                    android.util.Log.e("AiAssistantDialog", "Callback error", t);
                }
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

    // ------------------------------------------------------------------ سجل المحادثات (Adapter)

    private interface HistoryListener {
        void onSelect(Session session);
        void onDelete(Session session);
    }

    private static class HistoryAdapter extends RecyclerView.Adapter<HistoryHolder> {
        private final Activity activity;
        private final List<Session> list;
        private final Session[] activeSession;
        private final HistoryListener listener;

        HistoryAdapter(Activity activity, List<Session> list, Session[] activeSession, HistoryListener listener) {
            this.activity = activity;
            this.list = list;
            this.activeSession = activeSession;
            this.listener = listener;
        }

        @NonNull
        @Override
        public HistoryHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.nat_item_ai_history, parent, false);
            return new HistoryHolder(v);
        }

        @Override
        public void onBindViewHolder(@NonNull HistoryHolder h, int position) {
            Session s = list.get(position);
            h.title.setText(s.title);
            h.date.setText(DATE_FORMAT.format(new Date(s.createdAt)));

            boolean isActive = activeSession[0] != null && s.id.equals(activeSession[0].id);
            h.itemView.setActivated(isActive);

            BaseActivity.applyFocusScale(h.itemView, 1.03f);
            BaseActivity.applyFocusScale(h.btnDelete, 1.15f);

            h.itemView.setOnClickListener(v -> listener.onSelect(s));
            h.btnDelete.setOnClickListener(v -> {
                int pos = h.getAdapterPosition();
                if (pos != RecyclerView.NO_POSITION && pos < list.size()) {
                    listener.onDelete(s);
                    notifyItemRemoved(pos);
                }
            });
        }

        @Override
        public int getItemCount() {
            return list.size();
        }
    }

    private static class HistoryHolder extends RecyclerView.ViewHolder {
        final TextView title, date;
        final ImageButton btnDelete;

        HistoryHolder(@NonNull View v) {
            super(v);
            title = v.findViewById(R.id.ai_history_title);
            date = v.findViewById(R.id.ai_history_date);
            btnDelete = v.findViewById(R.id.ai_history_btn_delete);
        }
    }

    // ------------------------------------------------------------------ عرض الرسائل

    private static final Pattern BOLD = Pattern.compile("\\*\\*(.+?)\\*\\*");

    static CharSequence renderMarkdown(String text) {
        if (text == null) return "";
        StringBuilder plain = new StringBuilder();
        for (String line : text.split("\n", -1)) {
            String l = line;
            if (l.startsWith("### ")) l = l.substring(4);
            else if (l.startsWith("## ")) l = l.substring(3);
            else if (l.startsWith("# ")) l = l.substring(2);
            if (l.startsWith("* ") || l.startsWith("- ")) l = "• " + l.substring(2);
            plain.append(l).append('\n');
        }
        if (plain.length() > 0 && plain.charAt(plain.length() - 1) == '\n') {
            plain.setLength(plain.length() - 1);
        }

        SpannableStringBuilder sb = new SpannableStringBuilder(plain);
        Matcher m = BOLD.matcher(sb);
        while (m.find()) {
            int start = m.start();
            int end = m.end();
            String inner = m.group(1);
            sb.replace(start, end, inner);
            sb.setSpan(new StyleSpan(Typeface.BOLD), start, start + inner.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            m = BOLD.matcher(sb);
        }
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
                h.stopAnimation();
                return;
            }
            h.userContainer.setVisibility(View.GONE);
            h.botContainer.setVisibility(View.VISIBLE);

            if (m.pending) {
                h.botText.setVisibility(View.GONE);
                if (h.loadingView != null) {
                    h.loadingView.setVisibility(View.VISIBLE);
                    h.startAnimation();
                }
            } else {
                h.stopAnimation();
                if (h.loadingView != null) h.loadingView.setVisibility(View.GONE);
                h.botText.setVisibility(View.VISIBLE);
                h.botText.setText(renderMarkdown(m.text));
            }

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
                        Ui.toast(activity, "تعذر فتح المصدر");
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

        @Override
        public void onViewRecycled(@NonNull MessageHolder holder) {
            super.onViewRecycled(holder);
            holder.stopAnimation();
        }
    }

    private static class MessageHolder extends RecyclerView.ViewHolder {
        final View userContainer, botContainer, sourcesBox;
        final TextView userText, botText;
        final LinearLayout cards, sources;
        final View loadingView, dot1, dot2, dot3;
        private final List<ObjectAnimator> runningAnimators = new ArrayList<>();

        MessageHolder(@NonNull View v) {
            super(v);
            userContainer = v.findViewById(R.id.ai_msg_user_container);
            botContainer = v.findViewById(R.id.ai_msg_bot_container);
            userText = v.findViewById(R.id.ai_msg_user_text);
            botText = v.findViewById(R.id.ai_msg_bot_text);
            cards = v.findViewById(R.id.ai_msg_cards);
            sources = v.findViewById(R.id.ai_msg_sources);
            sourcesBox = v.findViewById(R.id.ai_msg_sources_box);

            loadingView = v.findViewById(R.id.ai_msg_loading_view);
            dot1 = v.findViewById(R.id.ai_dot_1);
            dot2 = v.findViewById(R.id.ai_dot_2);
            dot3 = v.findViewById(R.id.ai_dot_3);
        }

        void startAnimation() {
            stopAnimation();
            if (dot1 == null || dot2 == null || dot3 == null) return;
            View[] dots = new View[]{dot1, dot2, dot3};
            for (int i = 0; i < dots.length; i++) {
                View dot = dots[i];
                dot.setScaleX(0.7f);
                dot.setScaleY(0.7f);
                dot.setAlpha(0.35f);

                ObjectAnimator sx = ObjectAnimator.ofFloat(dot, "scaleX", 0.7f, 1.35f, 0.7f);
                sx.setDuration(900);
                sx.setRepeatCount(ValueAnimator.INFINITE);
                sx.setStartDelay(i * 180);

                ObjectAnimator sy = ObjectAnimator.ofFloat(dot, "scaleY", 0.7f, 1.35f, 0.7f);
                sy.setDuration(900);
                sy.setRepeatCount(ValueAnimator.INFINITE);
                sy.setStartDelay(i * 180);

                ObjectAnimator alpha = ObjectAnimator.ofFloat(dot, "alpha", 0.35f, 1f, 0.35f);
                alpha.setDuration(900);
                alpha.setRepeatCount(ValueAnimator.INFINITE);
                alpha.setStartDelay(i * 180);

                runningAnimators.add(sx);
                runningAnimators.add(sy);
                runningAnimators.add(alpha);

                sx.start();
                sy.start();
                alpha.start();
            }
        }

        void stopAnimation() {
            for (ObjectAnimator a : runningAnimators) {
                if (a != null) {
                    try { a.cancel(); } catch (Exception ignored) {}
                }
            }
            runningAnimators.clear();
            if (dot1 != null) { dot1.setScaleX(1f); dot1.setScaleY(1f); dot1.setAlpha(1f); }
            if (dot2 != null) { dot2.setScaleX(1f); dot2.setScaleY(1f); dot2.setAlpha(1f); }
            if (dot3 != null) { dot3.setScaleX(1f); dot3.setScaleY(1f); dot3.setAlpha(1f); }
        }
    }
}
