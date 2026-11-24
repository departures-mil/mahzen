// Arayüz duman testi (gerçek Chromium, Playwright): kabuk köprüsü (fcHost, Go kabuğunun açtığı API'nin aynısı) taklit edilir.
// Denetlenen: hatasız açılış, sağ üst sıra, pencere düğmeleri, Ayarlar sırası (iletişim EN SON), klasik şema, Arapça RTL,
// silme → arşiv → geri alma, Firebase uzak silme → arşiv, güncelleme (latest.json → FCD1 yama → applyPatch), eski kabuk köprüsü.
'use strict';
const test = require('node:test'), assert = require('node:assert');
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PW = process.env.PLAYWRIGHT_CORE || 'playwright-core';
const { chromium } = require(PW);
const fcd = require('../araclar/fcdelta.js'), paket = require('../araclar/paket.js');
const WEB = path.join(__dirname, '..', 'kaynak', 'web');
const VER = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };

let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, s) => {
    const f = path.join(WEB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(WEB) || !fs.existsSync(f)) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  browser = await chromium.launch();
});
test.after(async () => { if (browser) await browser.close(); if (srv) srv.close(); });

// Go kabuğunun (host.go hostJS) sayfaya verdiği fcHost'un taklidi; indirmeler test sözlüğünden gelir.
function fakeHost(o) {
  window.__calls = [];
  const files = o.files || {};
  window.fcHost = {
    kind: 'webview2', platform: 'win32', version: o.version, shell: 'go-webview2',
    window: {
      minimize: () => { __calls.push('min'); return Promise.resolve(); }, half: () => { __calls.push('half'); return Promise.resolve(); },
      toggleFullscreen: () => { __calls.push('fs'); return Promise.resolve(); }, close: () => { __calls.push('close'); return Promise.resolve(); },
      getState: () => Promise.resolve({ fullscreen: true, half: false }), onState: () => () => {}
    },
    update: {
      channel: 'win-app',
      applyPatch: (b, m) => { __calls.push(['patch', b.length, m]); return Promise.resolve('restarting'); },
      installFull: (b, m) => { __calls.push(['full', b.length, m]); return Promise.resolve('restarting'); }
    },
    net: { download: (u, onp) => { const f = files[u]; if (!f) return Promise.reject(Object.assign(new Error('HTTP_404'), { code: 'HTTP_404' })); const b = Uint8Array.from(atob(f), (c) => c.charCodeAt(0)); onp && onp({ done: b.length, finished: true }); return Promise.resolve(b); } },
    agent: { read: () => Promise.resolve({}), write: () => Promise.resolve(true), remove: () => Promise.resolve(true) },
    onMainError: () => () => {}, openExternal: (u) => { __calls.push(['open', u]); }
  };
  window.mahzenLanHttp = () => true; window.mahzenLanInfo = () => Promise.resolve('{"ok":true,"on":false}');
  window.mahzenLanServe = window.mahzenLanStop = window.mahzenLanResetKey = window.mahzenLanFind = () => true; window.mahzenLanReply = () => true;
  localStorage.setItem('fc.onboarding.done', 'true');
  if (o.seen) localStorage.setItem('fc.whatsnew.seen', JSON.stringify(o.seen));
  if (o.scheme) localStorage.setItem('fc.scheme', JSON.stringify(o.scheme));
  if (o.lang) localStorage.setItem('fc.lang', JSON.stringify(o.lang));
}

async function open(opts) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
  await page.route('**/*', (r) => r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort());
  if (opts.host !== false) await page.addInitScript(fakeHost, Object.assign({ version: VER, seen: VER }, opts));
  else await page.addInitScript((o) => { localStorage.setItem('fc.onboarding.done', 'true'); localStorage.setItem('fc.whatsnew.seen', JSON.stringify(o.v)); window.mahzenSaveNative = () => true; window.mahzenOpen = (u) => { window.__opened = u; }; }, { v: VER });
  await page.goto(base);
  await page.waitForFunction(() => window.MahzenFC && document.querySelector('#topbar .topbar-actions') && typeof titles !== 'undefined' && titles.length > 0, null, { timeout: 15000 });
  return { page, errors };
}

test('açılış: hata yok, sağ üst sıra ve pencere düğmeleri', async () => {
  const { page, errors } = await open({});
  const order = await page.evaluate(() => [...document.querySelectorAll('#topbar .topbar-actions > *')].map((e) => e.className.split(' ').find((c) => /^(ann-btn|mz-settings-btn|fc-agent|sync-act|lan-act|top-act-wrap|theme-btn|lang-switch|topbar-sep|win-controls)$/.test(c)) || e.className));
  const idx = (k) => order.findIndex((x) => String(x).includes(k));
  assert.ok(idx('sync-act') < idx('lan-act') && idx('lan-act') < idx('top-act-wrap') && idx('top-act-wrap') < idx('theme-btn') && idx('theme-btn') < idx('lang-switch') && idx('lang-switch') < idx('win-controls'), JSON.stringify(order));
  const wins = await page.$$eval('#topbar .win-controls button', (b) => b.map((x) => x.dataset.win));
  assert.deepEqual(wins, ['minimize', 'half', 'fullscreen', 'close']);
  await page.click('#topbar [data-win="half"]'); await page.click('#topbar [data-win="minimize"]');
  assert.deepEqual(await page.evaluate(() => __calls.slice(0, 2)), ['half', 'min']);
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-scheme')), 'falcon');
  assert.ok(await page.evaluate(() => FC.look.schemes().includes('klasik')));
  assert.deepEqual(errors, []);
  await page.close();
});

test('Ayarlar: Görünüm başta, uygulama kartları, Admin ile iletişim EN SON', async () => {
  const { page, errors } = await open({});
  await page.click('#topbar .mz-settings-btn');
  await page.waitForSelector('#fcSettings [data-fc-card="contact"]');
  const cards = await page.$$eval('#fcSettings > [data-fc-card]', (c) => c.map((x) => x.getAttribute('data-fc-card')));
  assert.equal(cards[0], 'look');
  assert.equal(cards[cards.length - 1], 'contact');
  for (const k of ['mz-sec', 'mz-sync', 'mz-backup', 'mz-arsiv', 'agent', 'usage', 'crash', 'about']) assert.ok(cards.includes(k), k);
  assert.ok(await page.isVisible('#vSettings'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('Arapça sağdan sola, klasik şema eski renkler', async () => {
  const { page, errors } = await open({ lang: 'ar', scheme: 'klasik' });
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
  assert.equal(await page.evaluate(() => lang), 'ar');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--pri-1').trim()), '#f0c565');
  assert.deepEqual(errors, []);
  await page.close();
});

test('silme → arşiv → geri alma; Firebase uzak silme → arşiv', async () => {
  const { page, errors } = await open({});
  const r = await page.evaluate(async () => {
    const id = 't-steam';
    await removeRec('titles', id); titles = titles.filter((x) => x.id !== id);
    const a = await getOne('meta', 'arsiv:titles_' + id);
    // uzak silme (Firebase): yerel kayıt arşive
    pushed = {};
    await applyRemote('titles', 't-google', 'titles_t-google', { d: true, u: Date.now() + 1000 });
    const b = await getOne('meta', 'arsiv:titles_t-google');
    return { a: !!(a && a.rec && a.rec.name === 'Steam' && a.from === 'local'), b: !!(b && b.from === 'remote'), still: !!(await getOne('titles', 't-google')) };
  });
  assert.deepEqual(r, { a: true, b: true, still: false });
  await page.evaluate(() => go('settings'));
  await page.waitForSelector('[data-fc-card="mz-arsiv"] .mz-arsiv-row');
  await page.locator('[data-fc-card="mz-arsiv"] .mz-arsiv-row', { hasText: 'Steam' }).locator('button.btn').click();
  await page.waitForFunction(() => titles.some((x) => x.id === 't-steam'));
  assert.equal(await page.evaluate(async () => !!(await getOne('meta', 'arsiv:titles_t-steam'))), false);
  // Wi-Fi birleştirme: silinen kayıt yerelde arşive (kaynakta denetim: applyState silmeden önce arşivler)
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  const i = html.indexOf('async function applyState'), j = html.indexOf('await delIn(s, r.id)', i);
  assert.ok(i > 0 && j > 0 && html.slice(i, j).includes('await archiveRec(s, r.id, "remote")'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('güncelleme: latest.json → FCD1 yaması → kabuğa applyPatch (yüzde/MB bilgisiyle)', async () => {
  const oldZ = paket.build().z;
  const newZ = Buffer.concat([oldZ.subarray(0, 1000), Buffer.from('degisti'), oldZ.subarray(1000)]);
  const patch = await fcd.make(oldZ, newZ);
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const nv = VER.replace(/\d+$/, (x) => String(+x + 1));
  const man = { schema: 1, app: 'mahzen', version: nv, notes: { tr: 'x' }, minVersion: '3.9.0', assets: {
    'win-app': { file: 'Mahzen-' + nv + '-win-app.zip', size: newZ.length, sha256: sha(newZ), patches: { [VER]: { file: 'Mahzen-win-app.patch-from-' + VER + '.bin', size: patch.length, sha256: sha(patch) } } },
    'win-setup': { file: 'Mahzen-Setup-' + nv + '.exe', size: 10, sha256: sha(Buffer.alloc(10)) } } };
  const R = 'https://github.com/departures-mil/mahzen/releases/';
  const files = {
    [R + 'latest/download/latest.json']: Buffer.from(JSON.stringify(man)).toString('base64'),
    [R + 'download/v' + nv + '/' + encodeURIComponent(man.assets['win-app'].patches[VER].file)]: patch.toString('base64')
  };
  const { page, errors } = await open({ files });
  const plan = await page.evaluate(() => FC.updater.check());
  assert.equal(plan.mode, 'patch'); assert.equal(plan.version, nv);
  await page.evaluate(() => FC.updater.run());
  const call = await page.evaluate(() => __calls.find((c) => Array.isArray(c) && c[0] === 'patch'));
  assert.ok(call, 'applyPatch çağrılmadı');
  assert.equal(call[1], patch.length);
  assert.equal(call[2].targetSha256, sha(newZ));
  assert.deepEqual(errors, []);
  await page.close();
});

test('eski kabuk (3.8 Mahzen.exe, fcHost yok) → "Yeni kurulum gerekli"', async () => {
  const { page, errors } = await open({ host: false });
  await page.waitForSelector('.modal', { timeout: 5000 });
  assert.ok(await page.evaluate(() => MahzenFC.legacy));
  assert.deepEqual(errors, []);
  await page.close();
});
