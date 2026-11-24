/* Mahzen — ortak çekirdek kabuğu (cekirdek/fc-core.js). Sayfanın ana betiklerinden SONRA yüklenir; onlara yalnız kancalarla bağlanır
   (go("settings") → MahzenFC.settings, renderHdr → MahzenFC.syncState, renderAll → MahzenFC.refresh).
   Burada: sağ üst sıra (Duyurular · ✦ · Ayarlar · Eşitle · Wi‑Fi · Güncelle · Tema · Dil | Küçült · Orta · Tam ekran · Kapat), "klasik" renk şeması
   (3.8'e kadarki altın–gece görünümü), Ayarlar sayfası (Görünüm · Güvenlik · Eşitleme · Yedek · Arşiv · Asistan · Kullanım · Hata raporu ·
   Hakkında · Admin ile iletişim EN SON), dil köprüsü (sayfa `lang` ↔ FC.i18n), ilk açılış rehberi, "neler yeni", duyurular, çökme raporu,
   arşiv / çakışma yedeği (meta "arsiv:…" / "yedek:…") ve ESKİ KABUK KÖPRÜSÜ (3.8 ve önceki Mahzen.exe: fcHost yok → "Yeni kurulum gerekli"). */
(function () {
  'use strict';
  var OWNER = 'departures-mil', REPO = 'mahzen', APP = 'mahzen';
  var REL = window.APP_RELEASE || { version: APP_VERSION, notes: {} };
  var VER = REL.version;
  var ui = FC.ui;
  var T = function (k, v) { return FC.t(k, v); };
  var DESK = typeof window.mahzenLanHttp === 'function';
  var AND = window.Android && typeof window.Android.lanHttp === 'function' ? window.Android : null;
  // 3.8 ve önceki masaüstü kabuğu (Mahzen.exe yerel sürüm ≤ 3): pencere/güncelleme köprüsü (fcHost) yok
  var LEGACY = !window.fcHost && (typeof window.mahzenSaveNative === 'function' || typeof window.mahzenSaveUpdate === 'function');

  /* ---------- metinler ---------- */
  FC.i18n.add({
    tr: {
      'mz.settings': 'Ayarlar', 'mz.sec': 'Güvenlik', 'mz.sec.desc': 'Ana şifre bütün hesap şifrelerini ve notları bu cihazda şifreler; eşitlemede de aynı şifre kullanılır.',
      'mz.sec.on': 'Ana şifre açık.', 'mz.sec.off': 'Ana şifre yok: kayıtlar bu cihazda şifrelenmeden durur.', 'mz.sec.set': 'Ana şifre koy', 'mz.sec.change': 'Ana şifreyi değiştir', 'mz.sec.remove': 'Ana şifreyi kaldır', 'mz.sec.lock': 'Şimdi kilitle',
      'mz.sync': 'Eşitleme', 'mz.sync.desc': 'Telefon ve bilgisayar kendi Firebase projeniz üzerinden (şifreli) ya da aynı Wi‑Fi ağında internetsiz eşitlenir.',
      'mz.sync.fb': 'Firebase eşitleme', 'mz.sync.wifi': 'Wi‑Fi ile eşitleme', 'mz.sync.on': 'Bağlı: {e}', 'mz.sync.off': 'Firebase eşitleme kurulmadı.', 'mz.sync.now': 'Şimdi eşitle',
      'mz.backup': 'Yedek', 'mz.backup.desc': 'Bütün başlıklar, hesaplar, dosyalar ve isim rehberi tek bir JSON dosyasına. Ana şifre varsa şifreler dosyada da şifreli kalır.', 'mz.backup.exp': 'Yedek al', 'mz.backup.imp': 'Yedekten yükle',
      'mz.arsiv': 'Arşiv ve çakışma yedeği', 'mz.arsiv.desc': 'Silinen kayıtlar (bu cihazda ya da başka cihazda) kalıcı olarak silinmez, burada durur. Eşitlemede üstüne yazılan eski sürümler de çakışma yedeğinde tutulur (son 200). İstediğinizi geri alabilirsiniz.',
      'mz.arsiv.bos': 'Arşivde kayıt yok.', 'mz.arsiv.geri': 'Geri al', 'mz.arsiv.geriAlindi': 'Geri alındı: {s}', 'mz.arsiv.uzak': 'başka cihazda silindi', 'mz.arsiv.yerel': 'bu cihazda silindi',
      'mz.arsiv.yedek': 'Çakışma yedeği', 'mz.arsiv.yedekBos': 'Çakışma yedeği boş.', 'mz.arsiv.kaynak.firebase': 'Firebase eşitlemesinde değişti', 'mz.arsiv.kaynak.wifi': 'Wi‑Fi eşitlemesinde değişti', 'mz.arsiv.fazla': '… ve {n} kayıt daha', 'mz.arsiv.sil': 'Kalıcı sil', 'mz.arsiv.silSor': 'Bu arşiv kaydı kalıcı olarak silinsin mi? Geri alınamaz.',
      'mz.col.titles': 'Başlık', 'mz.col.accounts': 'Hesap', 'mz.col.files': 'Dosya', 'mz.col.people': 'Kişi',
      'mz.kurulum': 'Yeni kurulum gerekli', 'mz.kurulum.p1': 'Mahzen {v} yeni bir masaüstü kabuğuyla gelir: tam ekran açılış, tek tuşla güncelleme (yalnızca değişen kısımlar iner) ve yeni görünüm.',
      'mz.kurulum.p2': 'Kayıtlarınız korunur: Mahzen.exe\'yi aynı klasöre kurun (kurulum programı bunu kendisi önerir); veri klasörü (veri\\) olduğu gibi kalır.',
      'mz.kurulum.sayfa': 'Sürümler sayfası', 'mz.kurulum.sonra': 'Daha sonra', 'mz.lock': 'Kilitle'
    },
    en: {
      'mz.settings': 'Settings', 'mz.sec': 'Security', 'mz.sec.desc': 'The master password encrypts every account password and note on this device; sync uses the same password.',
      'mz.sec.on': 'Master password is on.', 'mz.sec.off': 'No master password: records are kept unencrypted on this device.', 'mz.sec.set': 'Set master password', 'mz.sec.change': 'Change master password', 'mz.sec.remove': 'Remove master password', 'mz.sec.lock': 'Lock now',
      'mz.sync': 'Sync', 'mz.sync.desc': 'Phone and computer sync through your own Firebase project (encrypted) or, without internet, on the same Wi‑Fi network.',
      'mz.sync.fb': 'Firebase sync', 'mz.sync.wifi': 'Wi‑Fi sync', 'mz.sync.on': 'Connected: {e}', 'mz.sync.off': 'Firebase sync is not set up.', 'mz.sync.now': 'Sync now',
      'mz.backup': 'Backup', 'mz.backup.desc': 'All titles, accounts, files and the name book in one JSON file. With a master password, passwords stay encrypted in the file too.', 'mz.backup.exp': 'Export backup', 'mz.backup.imp': 'Import backup',
      'mz.arsiv': 'Archive and conflict backup', 'mz.arsiv.desc': 'Deleted records (on this or another device) are never deleted for good; they are kept here. Older versions overwritten by sync are kept in the conflict backup (last 200). You can restore any of them.',
      'mz.arsiv.bos': 'The archive is empty.', 'mz.arsiv.geri': 'Restore', 'mz.arsiv.geriAlindi': 'Restored: {s}', 'mz.arsiv.uzak': 'deleted on another device', 'mz.arsiv.yerel': 'deleted on this device',
      'mz.arsiv.yedek': 'Conflict backup', 'mz.arsiv.yedekBos': 'The conflict backup is empty.', 'mz.arsiv.kaynak.firebase': 'changed by Firebase sync', 'mz.arsiv.kaynak.wifi': 'changed by Wi‑Fi sync', 'mz.arsiv.fazla': '… and {n} more', 'mz.arsiv.sil': 'Delete for good', 'mz.arsiv.silSor': 'Delete this archived record for good? This cannot be undone.',
      'mz.col.titles': 'Title', 'mz.col.accounts': 'Account', 'mz.col.files': 'File', 'mz.col.people': 'Person',
      'mz.kurulum': 'New installation required', 'mz.kurulum.p1': 'Mahzen {v} comes with a new desktop shell: full-screen start, one-click updates (only the changed parts are downloaded) and a new look.',
      'mz.kurulum.p2': 'Your records are kept: install Mahzen.exe into the same folder (the installer offers it); the data folder (veri\\) stays as it is.',
      'mz.kurulum.sayfa': 'Releases page', 'mz.kurulum.sonra': 'Later', 'mz.lock': 'Lock'
    },
    ar: {
      'mz.settings': 'الإعدادات', 'mz.sec': 'الأمان', 'mz.sec.desc': 'كلمة المرور الرئيسية تشفّر كل كلمات مرور الحسابات والملاحظات على هذا الجهاز؛ وتستخدم المزامنة الكلمة نفسها.',
      'mz.sec.on': 'كلمة المرور الرئيسية مفعّلة.', 'mz.sec.off': 'لا توجد كلمة مرور رئيسية: السجلات محفوظة دون تشفير على هذا الجهاز.', 'mz.sec.set': 'تعيين كلمة مرور رئيسية', 'mz.sec.change': 'تغيير كلمة المرور الرئيسية', 'mz.sec.remove': 'إزالة كلمة المرور الرئيسية', 'mz.sec.lock': 'اقفل الآن',
      'mz.sync': 'المزامنة', 'mz.sync.desc': 'يتزامن الهاتف والحاسوب عبر مشروع Firebase الخاص بك (مشفّراً) أو دون إنترنت على شبكة Wi‑Fi نفسها.',
      'mz.sync.fb': 'مزامنة Firebase', 'mz.sync.wifi': 'المزامنة عبر Wi‑Fi', 'mz.sync.on': 'متصل: {e}', 'mz.sync.off': 'لم يتم إعداد مزامنة Firebase.', 'mz.sync.now': 'زامن الآن',
      'mz.backup': 'النسخ الاحتياطي', 'mz.backup.desc': 'كل العناوين والحسابات والملفات ودليل الأسماء في ملف JSON واحد. مع كلمة مرور رئيسية تبقى كلمات المرور مشفّرة في الملف أيضاً.', 'mz.backup.exp': 'تصدير نسخة احتياطية', 'mz.backup.imp': 'استيراد نسخة احتياطية',
      'mz.arsiv': 'الأرشيف والنسخ الاحتياطية للتعارضات', 'mz.arsiv.desc': 'السجلات المحذوفة (على هذا الجهاز أو غيره) لا تُحذف نهائياً بل تبقى هنا. والنسخ القديمة التي استبدلتها المزامنة تُحفظ في نسخة التعارضات (آخر 200). يمكنك استعادة أيٍّ منها.',
      'mz.arsiv.bos': 'الأرشيف فارغ.', 'mz.arsiv.geri': 'استعادة', 'mz.arsiv.geriAlindi': 'تمت الاستعادة: {s}', 'mz.arsiv.uzak': 'حُذف على جهاز آخر', 'mz.arsiv.yerel': 'حُذف على هذا الجهاز',
      'mz.arsiv.yedek': 'نسخة التعارضات', 'mz.arsiv.yedekBos': 'نسخة التعارضات فارغة.', 'mz.arsiv.kaynak.firebase': 'تغيّر في مزامنة Firebase', 'mz.arsiv.kaynak.wifi': 'تغيّر في مزامنة Wi‑Fi', 'mz.arsiv.fazla': '… و{n} أخرى', 'mz.arsiv.sil': 'حذف نهائي', 'mz.arsiv.silSor': 'حذف هذا السجل المؤرشف نهائياً؟ لا يمكن التراجع.',
      'mz.col.titles': 'عنوان', 'mz.col.accounts': 'حساب', 'mz.col.files': 'ملف', 'mz.col.people': 'شخص',
      'mz.kurulum': 'يلزم تثبيت جديد', 'mz.kurulum.p1': 'يأتي Mahzen {v} بغلاف جديد لسطح المكتب: فتح بملء الشاشة، وتحديث بضغطة واحدة (تُنزَّل الأجزاء المتغيرة فقط)، ومظهر جديد.',
      'mz.kurulum.p2': 'سجلاتك محفوظة: ثبّت Mahzen.exe في المجلد نفسه (يقترح برنامج التثبيت ذلك)؛ ويبقى مجلد البيانات (veri\\) كما هو.',
      'mz.kurulum.sayfa': 'صفحة الإصدارات', 'mz.kurulum.sonra': 'لاحقاً', 'mz.lock': 'قفل'
    }
  });

  /* ---------- "klasik": 3.8'e kadarki altın + gece görünümü (tek mod; açık modda da aynı) ---------- */
  var KLASIK = {
    '--bg': '#0d121d', '--bg-grid': '#0000', '--panel': '#172034e0', '--panel-solid': '#172034', '--panel-hover': '#1d263a',
    '--border': '#f0c56529', '--border-strong': '#f0c56573', '--border-w': '1px', '--text': '#f3efe6', '--muted': '#b9b2a3', '--label': '#e4dccb',
    '--nav-text': '#b9b2a3', '--nav-title': '#8f8878', '--accent': '#f0c565', '--accent-2': '#c98a35', '--on-accent': '#1d1404',
    '--primary-1': '#f0c565', '--primary-2': '#c98a35', '--active-1': '#f0c56533', '--active-2': '#f0c5651a', '--active-line': '#f0c56566',
    '--accent-soft': '#f0c5651f', '--accent-line': '#f0c56559', '--focus': '#f0c565', '--focus-w': '2px', '--focus-ring': '#f0c56533',
    '--danger': '#ff8a96', '--warn': '#f2c46b', '--ok': '#5bd6a0', '--ok-text': '#5bd6a0', '--danger-text': '#ff8a96', '--warn-text': '#f2c46b',
    '--ok-soft': '#123528', '--ok-line': '#5bd6a059', '--danger-soft': '#3d1820', '--danger-line': '#ff8a9659', '--warn-soft': '#3a2e12', '--warn-line': '#f2c46b59',
    '--sidebar-bg': '#0d121d', '--topbar-bg': '#0d121de6', '--modal-bg': '#172034', '--modal-border': '#f0c5653d', '--backdrop': '#050812a6',
    '--toast-bg': '#111111', '--toast-text': '#ffffff', '--toast-line': '#2a2f3d', '--toast-err-bg': '#3d1820', '--toast-err-text': '#ffffff', '--toast-err-line': '#ff8a9659',
    '--badge-text': '#f3efe6', '--badge-bg': '#2a2f3d', '--badge-line': '#f0c56529', '--on-badge': '#1d1404',
    '--bar-track': '#1d263a', '--scroll-thumb': '#f0c56540', '--glow-1': '#0000', '--glow-2': '#0000',
    '--shadow-pop': '0 10px 30px #00000059', '--shadow-modal': '0 20px 60px #00000080', '--shadow-toast': '0 8px 24px #00000080'
  };
  FC.look.registerScheme('klasik', { dark: KLASIK, light: KLASIK, label: { tr: 'Klasik (eski görünüm)', en: 'Classic (previous look)', ar: 'الكلاسيكي (المظهر السابق)' } });

  // 3.8'den gelen kullanıcı (dil köprüsü localStorage'a yazmadan ÖNCE bakılır): "neler yeni" gösterilsin, ilk açılış rehberi gösterilmesin
  var ESKI = (function () { try { return !!(localStorage.getItem('lang') || localStorage.getItem('shamTab') || localStorage.getItem('lockKb') || localStorage.getItem('mahzenWifi')); } catch (e) { return false; } })();

  /* ---------- dil: çekirdek (fc.lang) ↔ sayfa (lang, localStorage "lang") ---------- */
  function pageLang(l) {
    if (typeof lang === 'undefined' || lang === l) return;
    var b = document.querySelector('#langs button[data-l="' + l + '"]');
    if (b) b.click();
  }
  if (FC.storage.get('lang', null) == null && typeof lang === 'string') FC.i18n.set(lang);
  pageLang(FC.i18n.lang());
  FC.i18n.onChange(function (l) { pageLang(l); });

  /* ---------- kullanım sayacı: Firestore REST çağrıları fetch ile → kendiliğinden sayılır ---------- */
  FC.usage.wrapFetch();

  /* ---------- çekirdeği başlat ---------- */
  try { if (ESKI && FC.storage.get('whatsnew.seen', null) == null) FC.storage.set('whatsnew.seen', '3.8.0'); } catch (e) { /* yoksay */ }
  try { if (ESKI && FC.storage.get('onboarding.done', null) == null) FC.storage.set('onboarding.done', true); } catch (e) { /* yoksay */ }
  FC.init({ app: APP, repo: REPO, version: VER, setupChannel: 'win-setup', announcements: true, whatsnew: false, onboarding: false });

  var bekleyenFb = null;
  function OB() {
    return {
      firebase: !(typeof sync !== 'undefined' && sync), ai: false,
      onFirebase: function (cfg) { bekleyenFb = cfg; },
      onClose: function () {
        if (!bekleyenFb) return;
        var cfg = bekleyenFb; bekleyenFb = null;
        setTimeout(function () {
          var ta = document.getElementById('sCfg');
          if (ta) ta.value = JSON.stringify(cfg, null, 2);
          var b = document.getElementById('syncBtn'); if (b) b.click();
        }, 150);
      }
    };
  }

  /* ---------- üst çubuk ---------- */
  var tb = null;
  function syncDurum() {
    if (typeof sync === 'undefined' || !sync) return 'off';
    if (typeof syncBusy !== 'undefined' && syncBusy) return 'syncing';
    if (navigator.onLine === false) return 'offline';
    return sync.err ? 'error' : 'idle';
  }
  function ayarBtn() {
    var b = ui.el('button.icon-btn.mz-settings-btn', { type: 'button', html: ui.icon('settings'), 'data-fc-track': 'mz.settings' });
    var draw = function () { b.title = T('mz.settings'); b.setAttribute('aria-label', T('mz.settings')); };
    b.addEventListener('click', function () { if (typeof view !== 'undefined' && view === 'settings') go('home'); else go('settings'); });
    draw(); FC.i18n.onChange(draw);
    return b;
  }
  function ustCubuk() {
    var bar = document.getElementById('topbar'); if (!bar || tb) return;
    tb = FC.topbar.mount(bar, {
      before: [FC.announcements.button(), ayarBtn()],
      sync: { state: syncDurum(), onClick: function () { var b = document.getElementById('hdrSync'); if (b) b.click(); } },
      lan: DESK || AND ? { onClick: function () { if (window.LanCore) LanCore.open(); } } : false
    });
    window.addEventListener('online', syncState); window.addEventListener('offline', syncState);
    if (DESK && typeof window.mahzenLanInfo === 'function') {
      var lan = function () { Promise.resolve(window.mahzenLanInfo()).then(function (s) { try { s = typeof s === 'string' ? JSON.parse(s) : s; tb.setLan(s && s.on ? 'on' : 'off'); } catch (e) { /* yoksay */ } }, function () {}); };
      lan(); setInterval(lan, 15000);
    }
  }
  var cizT = null;
  function syncState() {
    if (tb) tb.setSync(syncDurum());
    if (grid && typeof view !== 'undefined' && view === 'settings') { clearTimeout(cizT); cizT = setTimeout(cizKartlar, 300); }
  }

  /* ---------- Ayarlar ---------- */
  var grid = null, kartlar = [];
  function klik(id) { var b = document.getElementById(id); if (b) b.click(); }
  function btn(label, icon, fn, cls) { return ui.el('button.btn.small' + (cls ? '.' + cls : ''), { type: 'button', html: (icon ? ui.icon(icon) : '') + ui.esc(label), onclick: fn }); }
  function guvenlikKart() {
    var c = ui.card({ key: 'mz-sec', title: T('mz.sec'), icon: 'key', desc: T('mz.sec.desc') });
    var on = typeof master !== 'undefined' && !!master, ok = typeof CRYPTO_OK === 'undefined' || CRYPTO_OK;
    c.appendChild(ui.el('div.notice' + (on ? '.ok' : '.info'), { text: on ? T('mz.sec.on') : T('mz.sec.off') }));
    c.appendChild(ui.el('div.fc-row', null, [
      ok ? btn(T(on ? 'mz.sec.change' : 'mz.sec.set'), 'key', function () { klik('masterBtn'); }, 'primary') : null,
      on ? btn(T('mz.sec.remove'), null, function () { klik('masterRmBtn'); }, 'ghost') : null,
      on ? btn(T('mz.sec.lock'), null, function () { klik('lockNowBtn'); }) : null
    ].filter(Boolean)));
    return c;
  }
  function esitlemeKart() {
    var c = ui.card({ key: 'mz-sync', title: T('mz.sync'), icon: 'sync', desc: T('mz.sync.desc') });
    var s = typeof sync !== 'undefined' ? sync : null;
    c.appendChild(ui.el('div.fc-sub', { text: T('mz.sync.fb') }));
    c.appendChild(ui.el('div.notice' + (s ? (s.err ? '.error' : '.ok') : '.info'), { text: s ? T('mz.sync.on', { e: s.email || '' }) + (s.err ? ' · ⚠' : '') : T('mz.sync.off'), dir: 'auto' }));
    c.appendChild(ui.el('div.fc-row', null, [
      btn(T('mz.sync.fb'), 'cloud', function () { klik('syncBtn'); }, s ? '' : 'primary'),
      s ? btn(T('mz.sync.now'), 'sync', function () { klik('hdrSync'); }, 'primary') : null
    ].filter(Boolean)));
    if ((DESK || AND) && window.LanCore) {
      c.appendChild(ui.el('div.fc-sub', { text: T('mz.sync.wifi'), style: 'margin-top:12px' }));
      c.appendChild(ui.el('div.fc-row', null, [btn(T('mz.sync.wifi'), 'wifi', function () { LanCore.open(); })]));
    }
    return c;
  }
  function yedekKart() {
    var c = ui.card({ key: 'mz-backup', title: T('mz.backup'), icon: 'download', desc: T('mz.backup.desc') });
    c.appendChild(ui.el('div.fc-row', null, [btn(T('mz.backup.exp'), 'download', function () { klik('expBtn'); }, 'primary'), btn(T('mz.backup.imp'), null, function () { klik('impBtn'); })]));
    return c;
  }
  function etiket(e) {
    var r = e.rec || {};
    return (e.s === 'accounts' ? r.label || r.user : r.name) || '—';
  }
  async function geriAl(e, liste) {
    var r = Object.assign({}, e.rec, { updated: Date.now() });
    await putIn(e.s, r);
    try { await delIn('tombs', e.s + '_' + e.rid); } catch (x) { /* yoksay */ }
    if (liste === 'arsiv') await delIn('meta', e.id);
    await loadAll();
    if (typeof scheduleSync === 'function') scheduleSync();
    ui.toast(T('mz.arsiv.geriAlindi', { s: etiket(e) }), 'ok');
    try { renderAll(); setHeader(); } catch (x) { /* yoksay */ }
    cizKartlar();
  }
  function arsivKart() {
    var c = ui.card({ key: 'mz-arsiv', title: T('mz.arsiv'), icon: 'box', desc: T('mz.arsiv.desc') });
    var box = ui.el('div'); c.appendChild(box);
    if (typeof getAll !== 'function' || typeof db === 'undefined' || !db) return c;
    getAll('meta').then(function (all) {
      var ars = all.filter(function (m) { return String(m.id).indexOf('arsiv:') === 0 && m.rec; }).sort(function (a, b) { return b.at - a.at; });
      var yed = all.filter(function (m) { return String(m.id).indexOf('yedek:') === 0 && m.rec; }).sort(function (a, b) { return b.at - a.at; });
      function satir(e, liste) {
        var alt = liste === 'arsiv' ? (e.from === 'remote' ? T('mz.arsiv.uzak') : T('mz.arsiv.yerel')) : T('mz.arsiv.kaynak.' + (e.from === 'wifi' ? 'wifi' : 'firebase'));
        var zaman = new Date(e.at).toLocaleString(FC.i18n.lang() === 'ar' ? 'ar-u-nu-latn' : FC.i18n.lang() === 'en' ? 'en-US' : 'tr-TR');
        var kids = [btn(T('mz.arsiv.geri'), 'sync', function () { geriAl(e, liste).catch(function (x) { ui.toast(String(x && x.message || x), 'error'); }); })];
        if (liste === 'arsiv') kids.push(ui.el('button.icon-btn.tiny', { type: 'button', title: T('mz.arsiv.sil'), 'aria-label': T('mz.arsiv.sil'), html: ui.icon('x'), onclick: function () { if (confirm(T('mz.arsiv.silSor'))) delIn('meta', e.id).then(cizKartlar); } }));
        return ui.el('div.mz-arsiv-row', null, [
          ui.el('div.grow', null, [ui.el('span', { text: T('mz.col.' + e.s) + ' · ' + etiket(e), dir: 'auto' }), ui.el('small', { text: alt + ' · ' + zaman })]),
          ui.el('div.fc-row', { style: 'margin:0;flex-wrap:nowrap' }, kids)]);
      }
      function liste(arr, ad, bos) {
        if (!arr.length) { box.appendChild(ui.el('p.card-desc', { text: bos })); return; }
        arr.slice(0, 40).forEach(function (e) { box.appendChild(satir(e, ad)); });
        if (arr.length > 40) box.appendChild(ui.el('p.card-desc', { text: T('mz.arsiv.fazla', { n: arr.length - 40 }) }));
      }
      liste(ars, 'arsiv', T('mz.arsiv.bos'));
      box.appendChild(ui.el('div.fc-sub', { text: T('mz.arsiv.yedek') + ' (' + yed.length + ')', style: 'margin-top:12px' }));
      liste(yed, 'yedek', T('mz.arsiv.yedekBos'));
    }, function () {});
    return c;
  }
  function cizKartlar() {
    if (!grid) return;
    kartlar.forEach(function (k) { k.remove(); });
    kartlar = [guvenlikKart(), esitlemeKart(), yedekKart(), arsivKart()];
    var look = grid.querySelector(':scope > [data-fc-card="look"]');
    var ref = look ? look.nextSibling : grid.firstChild;
    kartlar.forEach(function (k) { k.setAttribute('data-mz-kart', ''); grid.insertBefore(k, ref); });
  }
  function ayarlar(host) {
    if (!grid) {
      grid = FC.settings.build(host, {
        cards: [], usage: { project: function () { return (typeof sync !== 'undefined' && sync && sync.projectId) || ''; }, ai: false },
        about: { version: VER }, onboarding: OB()
      }).el;
      grid.id = 'fcSettings';
    }
    cizKartlar();
  }

  /* ---------- eski kabuk köprüsü: 3.8 ve önceki Mahzen.exe ---------- */
  function relUrl() { return 'https://github.com/' + OWNER + '/' + REPO + '/releases/latest'; }
  function kopru() {
    var body = ui.el('div');
    body.appendChild(ui.el('p', { text: T('mz.kurulum.p1', { v: VER }) }));
    body.appendChild(ui.el('div.notice.ok', null, [ui.el('span', { html: ui.icon('check') }), ui.el('span', { text: T('mz.kurulum.p2') })]));
    ui.modal({ title: T('mz.kurulum'), icon: 'download', body: body, buttons: [
      { label: T('mz.kurulum.sonra'), cls: 'ghost' }, 'spacer',
      { label: T('mz.kurulum.sayfa'), icon: 'download', cls: 'primary', onClick: function () { if (window.mahzenOpen) window.mahzenOpen(relUrl()); else ui.openUrl(relUrl()); return false; } }
    ] });
  }
  if (LEGACY) FC.updater.run = function () { kopru(); return Promise.resolve('legacy'); };

  /* ---------- açılış ---------- */
  function basla() {
    ustCubuk();
    if (LEGACY) { setTimeout(kopru, 900); return; }
    var wn = FC.whatsnew.start({ version: VER, notes: function (v) { return v === VER ? REL.notes : null; } });
    if (!wn) setTimeout(function () { FC.onboarding.maybeStart(OB()); }, 800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', basla); else setTimeout(basla, 0);

  window.MahzenFC = { settings: ayarlar, refresh: cizKartlar, syncState: syncState, bridge: kopru, legacy: LEGACY, version: VER };
})();
