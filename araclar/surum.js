#!/usr/bin/env node
/* Sürümün tek kaynağı package.json. Kullanım:  node araclar/surum.js [X.Y.Z]
   Yazar: package.json (sürüm verildiyse), kaynak/web/surum.js (APP_RELEASE: sürüm + release-notes.json),
   kaynak/web/index.html içindeki APP_VERSION. npm test tutarlılığı denetler. */
'use strict';
const fs = require('fs'), path = require('path');
const KOK = path.join(__dirname, '..');
const pkgF = path.join(KOK, 'package.json'), pkg = JSON.parse(fs.readFileSync(pkgF, 'utf8'));
const v = process.argv[2] || pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(v)) { console.error('sürüm X.Y.Z olmalı: ' + v); process.exit(1); }
if (pkg.version !== v) { pkg.version = v; fs.writeFileSync(pkgF, JSON.stringify(pkg, null, 2) + '\n'); }
const notes = JSON.parse(fs.readFileSync(path.join(KOK, 'release-notes.json'), 'utf8'));
fs.writeFileSync(path.join(KOK, 'kaynak/web/surum.js'),
  '/* OTOMATİK: node araclar/surum.js — elle düzenlemeyin */\nwindow.APP_RELEASE = ' + JSON.stringify({ version: v, notes }, null, 1) + ';\n');
const hf = path.join(KOK, 'kaynak/web/index.html');
let h = fs.readFileSync(hf, 'utf8');
const n = h.replace(/const APP_VERSION="[0-9.]+";/, 'const APP_VERSION="' + v + '";');
if (n === h && !h.includes('const APP_VERSION="' + v + '";')) { console.error('APP_VERSION bulunamadı'); process.exit(1); }
fs.writeFileSync(hf, n);
console.log('sürüm ' + v);
