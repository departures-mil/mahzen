// Sürüm tutarlılığı, depo temizliği, çekirdek kopyası.
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const K = path.join(__dirname, '..'), r = (p) => fs.readFileSync(path.join(K, p), 'utf8');

test('sürüm tek kaynaktan: package.json = APP_VERSION = surum.js', () => {
  const v = JSON.parse(r('package.json')).version;
  assert.match(v, /^\d+\.\d+\.\d+$/);
  assert.ok(r('kaynak/web/index.html').includes('const APP_VERSION="' + v + '";'));
  assert.ok(r('kaynak/web/surum.js').includes('"version": "' + v + '"'));
  const n = JSON.parse(r('release-notes.json'));
  for (const l of ['tr', 'en', 'ar']) assert.ok(n[l] && n[l].length > 40, 'not: ' + l);
});

test('sürüm eski kanalın yayınladığından (3.8) büyük', () => {
  const v = JSON.parse(r('package.json')).version.split('.').map(Number);
  const eski = JSON.parse(r('guncelleme/son.json')).surum.split('.').map(Number);
  assert.ok(v[0] > eski[0] || (v[0] === eski[0] && v[1] > eski[1]), 'yeni sürüm ' + v.join('.') + ' ≤ ' + eski.join('.'));
});

test('ortak çekirdek kopyası ve commit', () => {
  assert.match(r('kaynak/web/cekirdek/VERSION').trim(), /^[0-9a-f]{40}$/);
  const core = r('kaynak/web/cekirdek/fc-core.js');
  for (const m of ['FC.updater', 'FC.topbar', 'FC.settings', 'FC.contact', 'FC.crash', 'FC.usage', 'FC.agent', 'FC.lanMerge']) assert.ok(core.includes(m), m);
  assert.ok(fs.existsSync(path.join(K, 'kaynak/web/cekirdek/fonts/inter-latin-400-normal.woff2')));
});

test('bağımsız Asistan Agent / eski duyuru / eski kullanım kopyaları kaldırıldı; yayıncı e-postası depoda yok', () => {
  const h = r('kaynak/web/index.html');
  assert.ok(!h.includes('FCAgent') && !h.includes('Kullanim.') && !h.includes('Duyuru.baslat'));
  assert.ok(!fs.existsSync(path.join(K, 'araclar/yayinla_firebase_eski.py')));
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.name === '.git' || e.name === 'node_modules' || e.name === 'deps' || e.name === 'cikti' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(K)) {
    if (/\.(b64|zip|woff2|ico|syso|png|old|new|patch)$/.test(f) || /guncelleme[\\/]mahzen-/.test(f)) continue;
    assert.ok(!new RegExp('yayinci' + '@mahzen|YAYINCI' + '_EPOSTA').test(fs.readFileSync(f, 'utf8')), 'yayıncı e-postası: ' + f);
  }
});

test('kayıtların yeri değişmedi (köken mahzen.local, veri/ klasörü)', () => {
  const m = r('kaynak/kabuk/main.go');
  assert.ok(m.includes('"mahzen.local"') && m.includes('filepath.Join(baseDir, "veri")'));
  assert.ok(r('kaynak/web/index.html').includes('indexedDB.open("isim-rehberi",3)'));
  assert.ok(m.includes('setFullscreen(true)'), 'her açılışta tam ekran');
});
