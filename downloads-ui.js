/**
 * واجهة تنزيل الأفلام والحلقات في برنامج الكمبيوتر (المحرك في electron/downloads.js).
 * لا تظهر في المتصفح ولا في أندرويد: أندرويد له مشغل أصلي بتنزيلاته، والمتصفح لا يحفظ ملفات.
 *
 * - زر "تنزيل" تحت "شاهد الآن" في صفحة الفيلم، ويعرض حالة التنزيل.
 * - دائرة حالة على كل حلقة، وزر "تنزيل الموسم".
 * - صندوق التنزيل: التقدّم والحجم والسرعة والوقت المتبقي ومكان الحفظ، مع الإيقاف والإلغاء.
 * - صفحة التنزيلات من زر في الشريط العلوي: المشاهدة بلا إنترنت، الحذف، فتح المجلد، تغيير المكان.
 * - playStream يشغّل الملف المنزّل بدل الرابط، ويوقف التنزيل قبل أي بث من السيرفر.
 */
(function () {
    'use strict';
    var api = window.electronAPI && window.electronAPI.downloads;
    var state = { items: [], dir: '', free: 0, playbackActive: false, currentId: null };
    var listeners = [];

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    function fmtBytes(b) {
        if (!b || b <= 0) return '0 MB';
        if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
        return (b / 1048576).toFixed(1) + ' MB';
    }
    function fmtSpeed(bps) {
        if (!bps || bps <= 0) return '—';
        return bps >= 1048576 ? (bps / 1048576).toFixed(1) + ' MB/s' : Math.round(bps / 1024) + ' KB/s';
    }
    function fmtEta(i) {
        if (!i.speed || !i.total) return '—';
        var s = Math.round((i.total - i.done) / i.speed);
        if (s >= 3600) return Math.floor(s / 3600) + ' س ' + Math.floor((s % 3600) / 60) + ' د';
        if (s >= 60) return Math.floor(s / 60) + ' د ' + (s % 60) + ' ث';
        return s + ' ث';
    }
    /** قيمة إنجليزية داخل نص عربي تبقى بترتيبها. */
    function ltr(s) { return '<bdi dir="ltr">' + esc(s) + '</bdi>'; }
    function pct(i) { return i.total > 0 ? Math.min(100, Math.floor(i.done * 100 / i.total)) : 0; }
    function isActive(i) { return i.state === 'queued' || i.state === 'running'; }

    function find(id) {
        for (var n = 0; n < state.items.length; n++) if (state.items[n].id === id) return state.items[n];
        return null;
    }

    function statusText(i) {
        switch (i.state) {
            case 'running': return 'جاري التنزيل';
            case 'queued':
                if (state.playbackActive) return 'متوقف أثناء المشاهدة — يكمل بعد إغلاق المشغل';
                return i.error ? i.error : 'في قائمة الانتظار';
            case 'paused': return 'متوقف مؤقتاً';
            case 'done': return 'تم التنزيل — جاهز للمشاهدة بدون إنترنت';
            case 'failed': return 'فشل: ' + (i.error || '');
            default: return '';
        }
    }

    function streamUrl(kind, id, ext) {
        return typeof window.mizoStreamUrl === 'function'
            ? window.mizoStreamUrl(kind === 'episode' ? 'series' : 'vod', id, ext) : '';
    }

    // ------------------------------------------------------------------ الحالة

    function apply(snap) {
        if (!snap) return;
        state = snap;
        listeners.forEach(function (fn) { try { fn(); } catch (e) { } });
    }

    function onChange(fn) { listeners.push(fn); }

    // ------------------------------------------------------------------ بطاقة التنزيل

    function cardHtml(i) {
        var done = i.state === 'done';
        var poster = i.posterUrl || i.poster || 'photo/logo.ico';
        var colors = { done: '#22c55e', failed: '#f87171', paused: '#f59e0b', running: '#38bdf8' };
        var stats;
        if (done) {
            stats = 'الحجم: ' + ltr(fmtBytes(i.total));
        } else {
            stats = ltr(fmtBytes(i.done)) + ' من ' + (i.total > 0 ? ltr(fmtBytes(i.total)) : '…');
            if (i.total > 0) stats += '  ' + ltr('(' + pct(i) + '%)');
            if (i.state === 'running') {
                stats += '<span class="mdl-sep">·</span>السرعة: ' + ltr(fmtSpeed(i.speed)) +
                    '<span class="mdl-sep">·</span>المتبقي: ' + esc(fmtEta(i));
            }
        }
        var primary = done
            ? '<button type="button" class="mdl-btn mdl-btn-play" data-act="play" title="مشاهدة"><i class="fas fa-play"></i></button>'
            : isActive(i)
                ? '<button type="button" class="mdl-btn" data-act="pause" title="إيقاف مؤقت"><i class="fas fa-pause"></i></button>'
                : '<button type="button" class="mdl-btn" data-act="resume" title="' + (i.state === 'failed' ? 'إعادة المحاولة' : 'استئناف') + '"><i class="fas ' + (i.state === 'failed' ? 'fa-rotate-right' : 'fa-download') + '"></i></button>';
        var extra = done
            ? '<button type="button" class="mdl-btn" data-act="show" title="إظهار في المجلد"><i class="fas fa-folder-open"></i></button>'
            : '';
        var secondary = '<button type="button" class="mdl-btn mdl-btn-danger" data-act="remove" title="' + (done ? 'حذف' : 'إلغاء التنزيل') + '"><i class="fas ' + (done ? 'fa-trash' : 'fa-xmark') + '"></i></button>';
        return '<div class="mdl-card" data-id="' + esc(i.id) + '">' +
            '<img class="mdl-poster" src="' + esc(poster) + '" onerror="this.src=\'photo/logo.ico\'" alt="">' +
            '<div class="mdl-info">' +
            '<div class="mdl-title">' + esc(i.title) + '</div>' +
            '<div class="mdl-sub">' + esc(i.subtitle || (i.kind === 'episode' ? 'حلقة' : 'فيلم')) + '</div>' +
            '<div class="mdl-status" style="color:' + (colors[i.state] || '#cbd5e1') + '">' + esc(statusText(i)) + '</div>' +
            (done ? '' : '<div class="mdl-bar"><div class="mdl-bar-fill' + (i.state === 'running' && !i.total ? ' indeterminate' : '') + '" style="width:' + pct(i) + '%"></div></div>') +
            '<div class="mdl-stats">' + stats + '</div>' +
            '</div>' +
            '<div class="mdl-actions">' + primary + extra + secondary + '</div>' +
            '</div>';
    }

    function bindCard(root) {
        root.querySelectorAll('.mdl-card [data-act]').forEach(function (b) {
            b.onclick = function (e) {
                e.stopPropagation();
                var id = b.closest('.mdl-card').getAttribute('data-id');
                var i = find(id);
                if (!i) return;
                var act = b.getAttribute('data-act');
                if (act === 'pause') api.pause(id).then(apply);
                else if (act === 'resume') api.resume(id).then(apply);
                else if (act === 'play') playLocal(i);
                else if (act === 'show') api.showFile(id);
                else if (act === 'remove') confirmRemove(i);
            };
        });
    }

    function confirmRemove(i) {
        var done = i.state === 'done';
        var msg = done ? 'سيُحذف "' + i.title + '" من الجهاز.' : 'سيتوقف تنزيل "' + i.title + '" ويُحذف ما نزل منه.';
        var go = function () { api.remove(i.id).then(apply); };
        if (typeof window.showConfirm === 'function') {
            Promise.resolve(window.showConfirm(msg, { title: done ? 'حذف الملف' : 'إلغاء التنزيل', okText: done ? 'حذف' : 'إلغاء التنزيل', cancelText: 'تراجع' })).then(function (ok) { if (ok) go(); });
        } else if (typeof window.mizoConfirm === 'function') {
            window.mizoConfirm(msg, go);
        } else {
            go();
        }
    }

    function playLocal(i) {
        closeBox();
        closePage();
        if (typeof window.playStream !== 'function') return;
        window.mizoQueue = null; // لا "حلقة تالية" من مسلسل آخر
        window.playStream(i.kind === 'episode' ? i.contentKey.replace(/^ep:/, '') : i.contentKey.replace(/^vod:/, ''),
            i.kind === 'episode' ? 'series' : 'vod', i.ext, i.title, i.poster);
    }

    // ------------------------------------------------------------------ صندوق التنزيل

    var boxId = null;

    function openBox(id) {
        boxId = id;
        var el = document.getElementById('mizoDlBox');
        if (!el) {
            el = document.createElement('div');
            el.id = 'mizoDlBox';
            el.className = 'mdl-overlay';
            el.innerHTML = '<div class="mdl-dialog" role="dialog" aria-modal="true">' +
                '<div class="mdl-head"><i class="fas fa-download"></i><span id="mizoDlBoxTitle">التنزيل</span></div>' +
                '<div id="mizoDlBoxCard"></div>' +
                '<div class="mdl-line" id="mizoDlBoxLoc"></div>' +
                '<div class="mdl-line mdl-muted" id="mizoDlBoxQueue"></div>' +
                '<div class="mdl-foot">' +
                '<button type="button" class="mdl-foot-btn mdl-foot-main" id="mizoDlBoxAll"><i class="fas fa-list"></i> كل التنزيلات</button>' +
                '<button type="button" class="mdl-foot-btn" id="mizoDlBoxHide">إخفاء — يكمل في الخلفية</button>' +
                '</div></div>';
            document.body.appendChild(el);
            el.addEventListener('click', function (e) { if (e.target === el) closeBox(); });
            document.getElementById('mizoDlBoxHide').onclick = closeBox;
            document.getElementById('mizoDlBoxAll').onclick = function () { closeBox(); openPage(); };
        }
        el.classList.add('open');
        renderBox();
        setTimeout(function () {
            var b = el.querySelector('.mdl-card [data-act]');
            if (b) b.focus();
        }, 50);
    }

    function closeBox() {
        boxId = null;
        var el = document.getElementById('mizoDlBox');
        if (el) el.classList.remove('open');
    }

    function renderBox() {
        if (!boxId) return;
        var i = find(boxId);
        if (!i) { closeBox(); return; }
        var cardHost = document.getElementById('mizoDlBoxCard');
        var hadFocus = document.activeElement && cardHost.contains(document.activeElement) ? document.activeElement.getAttribute('data-act') : null;
        cardHost.innerHTML = cardHtml(i);
        bindCard(cardHost);
        if (hadFocus) { var f = cardHost.querySelector('[data-act]'); if (f) f.focus(); }
        document.getElementById('mizoDlBoxTitle').textContent = i.state === 'done' ? 'تم التنزيل' : 'التنزيل';
        var fileName = String(i.file || '').split(/[\\/]/).pop();
        document.getElementById('mizoDlBoxLoc').innerHTML = '<i class="fas fa-folder"></i> مكان الحفظ: ' +
            ltr(fileName) + '<span class="mdl-sep">·</span>المساحة المتاحة: ' + ltr(fmtBytes(state.free));
        var waiting = state.items.filter(function (x) { return x.state === 'queued' && x.id !== i.id; }).length;
        document.getElementById('mizoDlBoxQueue').textContent = waiting > 0
            ? 'في قائمة الانتظار بعده: ' + waiting + ' — تنزيل واحد في كل مرة حتى لا يحظر السيرفر الاتصال'
            : 'التنزيل يكمل في الخلفية حتى لو أغلقت هذه النافذة';
    }

    // ------------------------------------------------------------------ صفحة التنزيلات

    function openPage() {
        var el = document.getElementById('mizoDlPage');
        if (!el) {
            el = document.createElement('div');
            el.id = 'mizoDlPage';
            el.className = 'mdl-overlay mdl-page-overlay';
            el.innerHTML = '<div class="mdl-page" role="dialog" aria-modal="true">' +
                '<div class="mdl-page-head">' +
                '<div class="mdl-page-title"><i class="fas fa-download"></i> التنزيلات</div>' +
                '<div class="mdl-page-tools">' +
                '<button type="button" class="mdl-tool" id="mizoDlOpenFolder"><i class="fas fa-folder-open"></i> فتح المجلد</button>' +
                '<button type="button" class="mdl-tool" id="mizoDlChangeFolder"><i class="fas fa-pen"></i> تغيير مكان الحفظ</button>' +
                '<button type="button" class="mdl-tool mdl-tool-close" id="mizoDlClosePage" title="إغلاق"><i class="fas fa-xmark"></i></button>' +
                '</div></div>' +
                '<div class="mdl-page-sub" id="mizoDlSummary"></div>' +
                '<div class="mdl-page-list" id="mizoDlList"></div>' +
                '</div>';
            document.body.appendChild(el);
            el.addEventListener('click', function (e) { if (e.target === el) closePage(); });
            document.getElementById('mizoDlClosePage').onclick = closePage;
            document.getElementById('mizoDlOpenFolder').onclick = function () { api.openFolder(); };
            document.getElementById('mizoDlChangeFolder').onclick = function () {
                api.chooseFolder().then(function (snap) {
                    apply(snap);
                    if (typeof showToast === 'function') showToast('التنزيلات الجديدة ستُحفظ في: ' + snap.dir, 'success');
                });
            };
        }
        el.classList.add('open');
        renderPage();
        setTimeout(function () {
            var b = el.querySelector('.mdl-card [data-act]') || document.getElementById('mizoDlOpenFolder');
            if (b) b.focus();
        }, 50);
    }

    function closePage() {
        var el = document.getElementById('mizoDlPage');
        if (el) el.classList.remove('open');
    }

    function rank(i) {
        return i.state === 'running' ? 0 : i.state === 'queued' ? 1 : (i.state === 'paused' || i.state === 'failed') ? 2 : 3;
    }

    function renderPage() {
        var el = document.getElementById('mizoDlPage');
        if (!el || !el.classList.contains('open')) return;
        var list = state.items.slice().sort(function (a, b) {
            return rank(a) - rank(b) || (b.createdAt || 0) - (a.createdAt || 0);
        });
        var host = document.getElementById('mizoDlList');
        var focusedId = null, focusedAct = null;
        if (document.activeElement && host.contains(document.activeElement)) {
            var c = document.activeElement.closest('.mdl-card');
            focusedId = c && c.getAttribute('data-id');
            focusedAct = document.activeElement.getAttribute('data-act');
        }
        host.innerHTML = list.length ? list.map(cardHtml).join('') :
            '<div class="mdl-empty"><i class="fas fa-download"></i><div>لا توجد تنزيلات بعد</div>' +
            '<small>اضغط زر "تنزيل" في صفحة أي فيلم أو حلقة لتشاهدها لاحقاً بدون إنترنت</small></div>';
        bindCard(host);
        if (focusedId) {
            var card = host.querySelector('.mdl-card[data-id="' + CSS.escape(focusedId) + '"]');
            var btn = card && (card.querySelector('[data-act="' + focusedAct + '"]') || card.querySelector('[data-act]'));
            if (btn) btn.focus();
        }
        var done = 0, active = 0, used = 0;
        state.items.forEach(function (i) {
            if (i.state === 'done') { done++; used += i.total || 0; } else if (isActive(i)) active++;
        });
        var sum = done + ' ملف جاهز للمشاهدة بدون إنترنت (' + ltr(fmtBytes(used)) + ')';
        if (active) sum += '<span class="mdl-sep">·</span>' + active + ' قيد التنزيل أو الانتظار';
        if (state.playbackActive && active) sum += '<span class="mdl-sep">·</span>متوقف أثناء المشاهدة';
        sum += '<br><i class="fas fa-folder"></i> ' + ltr(state.dir) + '<span class="mdl-sep">·</span>متاح ' + ltr(fmtBytes(state.free));
        document.getElementById('mizoDlSummary').innerHTML = sum;
    }

    // ------------------------------------------------------------------ صفحة الفيلم

    var movieCtx = null;

    function attachMovie(movieId, ext, name, cover) {
        movieCtx = { id: String(movieId), ext: ext || 'mp4', name: name, cover: cover };
        var watch = document.getElementById('btnWatchMovie');
        if (!watch) return;
        var btn = document.getElementById('btnDownloadMovie');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'btnDownloadMovie';
            btn.type = 'button';
            btn.className = 'btn-download-movie';
            watch.insertAdjacentElement('afterend', btn);
        }
        btn.onclick = function () {
            var id = 'vod:' + movieCtx.id;
            if (find(id)) { openBox(id); return; }
            api.enqueue({
                id: id, kind: 'movie', title: movieCtx.name, subtitle: 'فيلم', poster: movieCtx.cover,
                ext: movieCtx.ext, url: streamUrl('movie', movieCtx.id, movieCtx.ext), contentKey: id
            }).then(function () { return api.list(); }).then(function (snap) { apply(snap); openBox(id); });
        };
        paintMovie();
    }

    function paintMovie() {
        var btn = document.getElementById('btnDownloadMovie');
        if (!btn || !movieCtx) return;
        var i = find('vod:' + movieCtx.id);
        var icon = 'fa-download', text = 'تنزيل';
        if (i) {
            if (i.state === 'done') { icon = 'fa-circle-check'; text = 'تم التنزيل ✓ — بدون إنترنت'; }
            else if (i.state === 'running') { text = 'جاري التنزيل ' + pct(i) + '%'; }
            else if (i.state === 'paused') { icon = 'fa-pause'; text = 'التنزيل متوقف ' + pct(i) + '%'; }
            else if (i.state === 'failed') { icon = 'fa-triangle-exclamation'; text = 'فشل التنزيل — اضغط للتفاصيل'; }
            else { icon = 'fa-clock'; text = 'في قائمة التنزيل'; }
        }
        btn.innerHTML = '<i class="fas ' + icon + '"></i> ' + esc(text);
        btn.classList.toggle('is-done', !!(i && i.state === 'done'));
    }

    // ------------------------------------------------------------------ المسلسلات

    var season = null; // { name, num, reqs: [{id, epId, title, ...}], grid, tabs }

    function episodeReq(seriesName, seasonNum, ep, idx, cover) {
        var epId = String(ep.id || ep.stream_id || ep.episode_id || '');
        var num = ep.episode_num || (idx + 1);
        var t = ep.title || ('الحلقة ' + num);
        var m = String(t).match(/E(\d+)/i);
        if (m && m[1] && /S\d+[\.\s]?E\d+/i.test(t)) t = 'الحلقة ' + parseInt(m[1], 10);
        var ext = ep.container_extension || 'mp4';
        return {
            id: 'ep:' + epId, kind: 'episode', epId: epId,
            title: seriesName + ' - ' + t,
            subtitle: 'الموسم ' + seasonNum + ' · الحلقة ' + num,
            poster: (ep.info && ep.info.movie_image) ? ep.info.movie_image : cover,
            ext: ext, url: streamUrl('episode', epId, ext), contentKey: 'ep:' + epId
        };
    }

    /** يُستدعى بعد رسم حلقات الموسم: دائرة الحالة على كل حلقة وزر تنزيل الموسم. */
    function attachSeason(seriesName, seasonNum, episodes, cover, grid, tabsWrapper) {
        var reqs = episodes.map(function (ep, idx) { return episodeReq(seriesName, seasonNum, ep, idx, cover); });
        season = { name: seriesName, num: seasonNum, reqs: reqs, grid: grid };
        var cards = grid.querySelectorAll('.episode-card');
        cards.forEach(function (card, idx) {
            var r = reqs[idx];
            if (!r || !r.epId) return;
            card.setAttribute('data-dl-id', r.id);
            var box = card.querySelector('.episode-thumb-box') || card;
            var badge = document.createElement('button');
            badge.type = 'button';
            badge.className = 'mdl-ep-badge';
            badge.tabIndex = -1; // باللوحة: زر القائمة (Menu) أو الضغط المطوّل؛ بالماوس: الدائرة
            badge.title = 'تنزيل الحلقة';
            badge.onclick = function (e) { e.stopPropagation(); downloadEpisode(r); };
            box.appendChild(badge);
            card.addEventListener('contextmenu', function (e) { e.preventDefault(); downloadEpisode(r); });
        });
        var btn = document.getElementById('btnDownloadSeason');
        if (!btn && tabsWrapper && tabsWrapper.parentNode) {
            btn = document.createElement('button');
            btn.id = 'btnDownloadSeason';
            btn.type = 'button';
            btn.className = 'btn-download-season';
            tabsWrapper.parentNode.insertBefore(btn, tabsWrapper);
        }
        if (btn) btn.onclick = downloadSeason;
        paintSeason();
    }

    function downloadEpisode(r) {
        if (find(r.id)) { openBox(r.id); return; }
        api.enqueue(r).then(function () { return api.list(); }).then(function (snap) { apply(snap); openBox(r.id); });
    }

    function downloadSeason() {
        if (!season) return;
        var todo = season.reqs.filter(function (r) { return r.epId && !find(r.id); });
        if (!todo.length) {
            if (typeof showToast === 'function') showToast('كل حلقات الموسم ' + season.num + ' منزّلة أو في قائمة التنزيل', 'info');
            return;
        }
        var chain = Promise.resolve();
        todo.forEach(function (r) { chain = chain.then(function () { return api.enqueue(r); }); });
        chain.then(function () { return api.list(); }).then(function (snap) {
            apply(snap);
            if (typeof showToast === 'function') showToast('أُضيفت ' + todo.length + ' حلقة إلى التنزيل — تتنزل واحدة بعد الأخرى', 'success');
            openBox(todo[0].id);
        });
    }

    function paintSeason() {
        if (!season || !season.grid || !document.body.contains(season.grid)) return;
        var done = 0;
        season.grid.querySelectorAll('.episode-card[data-dl-id]').forEach(function (card) {
            var i = find(card.getAttribute('data-dl-id'));
            var badge = card.querySelector('.mdl-ep-badge');
            if (!badge) return;
            var cls = 'mdl-ep-badge', html = '<i class="fas fa-download"></i>';
            if (i) {
                if (i.state === 'done') { cls += ' is-done'; html = '<i class="fas fa-circle-check"></i>'; done++; }
                else if (i.state === 'running') { cls += ' is-running'; html = '<span>' + pct(i) + '%</span>'; }
                else if (i.state === 'paused') { cls += ' is-paused'; html = '<i class="fas fa-pause"></i>'; }
                else if (i.state === 'failed') { cls += ' is-failed'; html = '<i class="fas fa-triangle-exclamation"></i>'; }
                else { cls += ' is-queued'; html = '<i class="fas fa-clock"></i>'; }
            }
            badge.className = cls;
            badge.innerHTML = html;
        });
        var btn = document.getElementById('btnDownloadSeason');
        if (btn) {
            var total = season.reqs.length;
            btn.innerHTML = '<i class="fas fa-download"></i> ' + (done === 0 ? 'تنزيل الموسم ' + esc(season.num)
                : done === total ? 'الموسم منزّل بالكامل ✓' : 'تنزيل الموسم (' + done + '/' + total + ')');
        }
    }

    // ------------------------------------------------------------------ المشغل

    /** رابط الملف المنزّل (file://) إن كان جاهزاً، وإلا فارغ. */
    function localUrl(type, id) {
        var i = find((type === 'vod' ? 'vod:' : 'ep:') + id);
        return i && i.state === 'done' && i.fileUrl ? i.fileUrl : '';
    }

    var resumeTimer = null;

    /**
     * قبل أي بث من السيرفر: إن كان هناك تنزيل يعمل يُقطع اتصاله أولاً ثم يبدأ المشغل، فلا
     * يلتقي اتصالان باللوحة. يعيد true إن أجّل التشغيل (فيُعاد استدعاء playStream بعد القطع).
     */
    function beforeStream(type, id, replay) {
        if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
        if (type !== 'live' && localUrl(type, id)) return false; // ملف منزّل: لا اتصال بالسيرفر
        if (state.playbackActive) return false;
        var busy = state.items.some(function (i) { return i.state === 'running'; });
        state.playbackActive = true;
        var p = api.setPlaybackActive(true);
        if (!busy) return false;
        p.then(replay, replay);
        return true;
    }

    /** بعد إغلاق المشغل: يكمل التنزيل بعد ثانية (حتى يُغلق المشغل اتصاله أولاً). */
    function afterStream() {
        if (resumeTimer) clearTimeout(resumeTimer);
        resumeTimer = setTimeout(function () {
            resumeTimer = null;
            state.playbackActive = false;
            api.setPlaybackActive(false);
        }, 1000);
    }

    // ------------------------------------------------------------------ التهيئة

    function addNavButton() {
        var ref = document.getElementById('navAccountsBtn');
        if (!ref || document.getElementById('navDownloadsBtn')) return;
        var b = document.createElement('button');
        b.id = 'navDownloadsBtn';
        b.type = 'button';
        b.className = 'nav-action-btn nav-btn-downloads';
        b.title = 'التنزيلات — المشاهدة بدون إنترنت';
        b.innerHTML = '<i class="fas fa-download"></i><span class="nav-dl-count hidden" id="navDownloadsCount"></span>';
        b.onclick = openPage;
        ref.insertAdjacentElement('afterend', b);
    }

    function paintNav() {
        var c = document.getElementById('navDownloadsCount');
        if (!c) return;
        var active = state.items.filter(isActive).length;
        c.textContent = active;
        c.classList.toggle('hidden', !active);
    }

    if (!api) {
        window.MizoDL = { available: false, localUrl: function () { return ''; }, beforeStream: function () { return false; }, afterStream: function () { }, attachMovie: function () { }, attachSeason: function () { } };
        return;
    }

    window.MizoDL = {
        available: true,
        attachMovie: attachMovie,
        attachSeason: attachSeason,
        localUrl: localUrl,
        beforeStream: beforeStream,
        afterStream: afterStream,
        openPage: openPage,
        openBox: openBox
    };

    onChange(renderBox);
    onChange(renderPage);
    onChange(paintMovie);
    onChange(paintSeason);
    onChange(paintNav);
    api.onChanged(apply);

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' && e.keyCode !== 27) return;
        var box = document.getElementById('mizoDlBox');
        var page = document.getElementById('mizoDlPage');
        if (box && box.classList.contains('open')) { closeBox(); e.stopImmediatePropagation(); e.preventDefault(); }
        else if (page && page.classList.contains('open')) { closePage(); e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);

    function start() {
        addNavButton();
        api.list().then(apply);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
