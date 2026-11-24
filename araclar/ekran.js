#!/usr/bin/env node
/* Ekran görüntüleri: node araclar/ekran.js <klasör>
   (PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)
   tr-falcon-dark, ar-falcon-light, tr-klasik — ana sayfa ve Ayarlar; kabuk köprüsü (fcHost) taklit edilir. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const WEB = path.join(__dirname, '..', 'kaynak', 'web'), OUT = path.resolve(process.argv[2] || 'ekran');
const VER = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = http.createServer((q, s) => { const f = path.join(WEB, q.url.split('?')[0].replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const b = await chromium.launch();
  for (const [ad, lang, scheme, theme] of [['tr-falcon-dark', 'tr', 'falcon', 'dark'], ['ar-falcon-light', 'ar', 'falcon', 'light'], ['tr-klasik', 'tr', 'klasik', 'dark']]) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await p.route('**/*', (r) => r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort());
    await p.addInitScript(([l, s, t, v]) => {
      const st = (k, x) => localStorage.setItem('fc.' + k, JSON.stringify(x));
      st('onboarding.done', true); st('whatsnew.seen', v); st('lang', l); st('scheme', s); st('theme', t);
      window.fcHost = { kind: 'webview2', platform: 'win32', version: v, window: { minimize() {}, half() {}, toggleFullscreen() {}, close() {}, getState: () => Promise.resolve({ fullscreen: true }), onState: () => () => {} },
        update: { channel: 'win-app', applyPatch: () => Promise.reject(new Error('x')), installFull: () => Promise.reject(new Error('x')) }, net: { download: () => Promise.reject(Object.assign(new Error('HTTP_404'), { code: 'HTTP_404' })) },
        agent: { read: () => Promise.resolve({}), write: () => Promise.resolve(true), remove: () => Promise.resolve(true) }, onMainError: () => () => {}, openExternal() {} };
      window.mahzenLanHttp = () => true; window.mahzenLanInfo = () => Promise.resolve('{"on":true}');
    }, [lang, scheme, theme, VER]);
    await p.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
    await p.waitForFunction(() => window.MahzenFC && typeof titles !== 'undefined' && titles.length > 0);
    await p.evaluate(async () => { // örnek kayıtlar (yalnız bu tarayıcı profilinde)
      const now = Date.now();
      for (const [i, a] of [['t-steam', 'Oyun hesabı', 'oyuncu42'], ['t-google', 'Gmail', 'ornek@gmail.com'], ['t-google', 'YouTube', 'kanal']].entries())
        await storeAccount({ id: 'demo' + i, titleId: a[0], label: a[1], user: a[2], pass: 'Şifre-' + i + '!x', note: '', created: now, updated: now });
      await loadAll(); go('home');
    });
    await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(OUT, ad + '.png') });
    await p.evaluate(() => go('settings')); await p.waitForTimeout(900);
    await p.screenshot({ path: path.join(OUT, ad + '-ayarlar.png') });
    await p.close();
    console.log(path.join(OUT, ad + '.png'));
  }
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
