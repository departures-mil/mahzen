// Go kabuğu: FCD1 + paket testleri (go test) ve Windows çapraz derleme denetimi (go vet). Bağımlılıklar: bash araclar/deps.sh
'use strict';
const test = require('node:test'), assert = require('node:assert');
const { spawnSync } = require('child_process'), path = require('path'), fs = require('fs');
const DIR = path.join(__dirname, '..', 'kaynak', 'kabuk');
const run = (args, env) => spawnSync('go', args, { cwd: DIR, encoding: 'utf8', env: Object.assign({}, process.env, env || {}) });

test('go test (FCD1 vektörleri, paket kurulumu, zip-slip)', () => {
  const r = run(['test', '-count=1', './...']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('Windows kabuğu derlenir (go vet, GOOS=windows)', () => {
  if (!fs.existsSync(path.join(DIR, 'deps', 'go-webview2'))) spawnSync('bash', [path.join(__dirname, '..', 'araclar', 'deps.sh')], { stdio: 'inherit' });
  if (!fs.existsSync(path.join(DIR, 'paket.zip'))) spawnSync(process.execPath, [path.join(__dirname, '..', 'araclar', 'paket.js')], { stdio: 'inherit' });
  const r = run(['vet', '.'], { GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
