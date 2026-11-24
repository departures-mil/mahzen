//go:build windows

// FC.host köprüsü (ortak-cekirdek/web/js/host.js): window.fcHost bu kabukta WebView2 bağlamalarıyla kurulur.
//   window.*   fcWin(action) → {fullscreen, half, max}; durum değişince window.__fcWinState(s)
//   net        fcNetStart(id, url) → indirme arka planda (yalnız GitHub adresleri, CORS'suz); ilerleme window.__fcNetProg(id, done, fin),
//              bitince window.__fcDone(id, {ok, data:{size}}); baytlar fcNetRead(id, off, n) ile base64 parçalar halinde okunur
//   update     fcUpBegin(kind, meta) → id · fcUpChunk(id, b64) · fcUpFinish(id) → window.__fcDone(id, {ok, data:'restarting'} | {ok:false, error})
//              kind 'patch' → web/paket.zip + FCD1 yaması (fcd1.go) → doğrula → kur → yeniden başlat
//              kind 'full'  → win-app zip'i kur ya da win-setup kurulum exe'sini (aynı klasöre, /D=) çalıştır ve kapan
//   agent      fcAgent(op, key, json) — %APPDATA%\FalconCekirdek\agent\*.json (Electron uygulamalarıyla ortak)
package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

func jsonMarshal(v interface{}) ([]byte, error) { return json.Marshal(v) }

var allowedHosts = regexp.MustCompile(`^(github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com|raw\.githubusercontent\.com|codeload\.github\.com)$`)

type hostRes struct {
	Ok    bool        `json:"ok"`
	Data  interface{} `json:"data,omitempty"`
	Error string      `json:"error,omitempty"`
}

func okRes(d interface{}) hostRes { return hostRes{Ok: true, Data: d} }
func errRes(e error) hostRes      { return hostRes{Ok: false, Error: e.Error()} }

var (
	hostMu  sync.Mutex
	dls     = map[int]*bytes.Buffer{}
	ups     = map[int]*upload{}
	upSeq   int
	curInfo paketBilgi
)

type upload struct {
	kind string
	meta map[string]interface{}
	buf  bytes.Buffer
}

// done: arka plandaki bir işin sonucunu sayfaya iletir.
func done(id int, r hostRes) {
	b, _ := json.Marshal(r)
	w.Dispatch(func() { w.Eval(fmt.Sprintf("window.__fcDone&&window.__fcDone(%d,%s)", id, string(b))) })
}

// safeGo: arka plan işindeki panik programı düşürmez; sayfaya (çökme raporu) iletilir.
func safeGo(id int, f func() hostRes) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				msg := fmt.Sprint(r)
				done(id, hostRes{Ok: false, Error: "PANIC"})
				b, _ := json.Marshal(map[string]string{"message": "kabuk: " + msg})
				w.Dispatch(func() { w.Eval("window.__fcMainErr&&window.__fcMainErr(" + string(b) + ")") })
			}
		}()
		done(id, f())
	}()
}

var httpc = &http.Client{
	Timeout: 30 * time.Minute,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if req.URL.Scheme != "https" || !allowedHosts.MatchString(req.URL.Hostname()) {
			return errors.New("URL_NOT_ALLOWED")
		}
		if len(via) > 8 {
			return errors.New("TOO_MANY_REDIRECTS")
		}
		return nil
	},
}

func netDownload(id int, raw string) hostRes {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || !allowedHosts.MatchString(u.Hostname()) {
		return errRes(errors.New("URL_NOT_ALLOWED"))
	}
	req, _ := http.NewRequest("GET", u.String(), nil)
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("User-Agent", "Mahzen/"+curInfo.Version)
	res, err := httpc.Do(req)
	if err != nil {
		return errRes(errors.New("NET"))
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return errRes(fmt.Errorf("HTTP_%d", res.StatusCode))
	}
	var buf bytes.Buffer
	chunk := make([]byte, 256<<10)
	last := time.Now()
	for {
		n, err := res.Body.Read(chunk)
		buf.Write(chunk[:n])
		if time.Since(last) > 150*time.Millisecond {
			last = time.Now()
			d := buf.Len()
			w.Dispatch(func() { w.Eval(fmt.Sprintf("window.__fcNetProg&&window.__fcNetProg(%d,%d,false)", id, d)) })
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return errRes(errors.New("NET"))
		}
		if buf.Len() > 512<<20 {
			return errRes(errors.New("TOO_BIG"))
		}
	}
	d := buf.Len()
	w.Dispatch(func() { w.Eval(fmt.Sprintf("window.__fcNetProg&&window.__fcNetProg(%d,%d,true)", id, d)) })
	hostMu.Lock()
	dls[id] = &buf
	hostMu.Unlock()
	return okRes(map[string]int{"size": d})
}

func netRead(id, off, n int) hostRes {
	hostMu.Lock()
	b := dls[id]
	hostMu.Unlock()
	if b == nil || off < 0 || off > b.Len() {
		return errRes(errors.New("NO_DOWNLOAD"))
	}
	end := off + n
	if end > b.Len() {
		end = b.Len()
	}
	return okRes(base64.StdEncoding.EncodeToString(b.Bytes()[off:end]))
}

func isSetup(meta map[string]interface{}) bool {
	ch, _ := meta["channel"].(string)
	f, _ := meta["file"].(string)
	return strings.Contains(strings.ToLower(ch), "setup") || strings.HasSuffix(strings.ToLower(f), ".exe")
}

func metaStr(meta map[string]interface{}, k string) string { s, _ := meta[k].(string); return strings.ToLower(s) }
func metaInt(meta map[string]interface{}, k string) int64 {
	if f, ok := meta[k].(float64); ok {
		return int64(f)
	}
	return 0
}

// runSetup: win-setup (NSIS) kurulum dosyasını doğrular, geçici klasöre yazar, bu klasöre kurmak üzere (/D=) çalıştırır ve programı kapatır.
// Kurulum aynı klasöre yapıldığı için veri/ (kayıtlar) ve wifi-esitleme.json yerinde kalır.
func runSetup(b []byte, meta map[string]interface{}) hostRes {
	if sha := metaStr(meta, "targetSha256"); sha == "" || shaHex(b) != sha {
		return errRes(errors.New("BAD_HASH"))
	}
	if sz := metaInt(meta, "targetSize"); sz > 0 && int64(len(b)) != sz {
		return errRes(errors.New("BAD_SIZE"))
	}
	if len(b) < 2 || b[0] != 'M' || b[1] != 'Z' {
		return errRes(errors.New("NOT_EXE"))
	}
	dir := filepath.Join(os.TempDir(), fmt.Sprintf("mahzen-kurulum-%d", os.Getpid()))
	os.MkdirAll(dir, 0755)
	name := regexp.MustCompile(`[^\w.-]`).ReplaceAllString(metaStr(meta, "file"), "_")
	if !strings.HasSuffix(name, ".exe") {
		name = "Mahzen-Setup.exe"
	}
	exe := filepath.Join(dir, name)
	if err := os.WriteFile(exe, b, 0755); err != nil {
		return errRes(errors.New("NO_WRITE"))
	}
	if got, _ := os.ReadFile(exe); shaHex(got) != shaHex(b) {
		return errRes(errors.New("STAGE_VERIFY"))
	}
	cmd := exec.Command(exe, "/D="+baseDir) // NSIS: /D= son parametre, tırnaksız
	if err := cmd.Start(); err != nil {
		return errRes(errors.New("SETUP_START"))
	}
	go func() { time.Sleep(400 * time.Millisecond); w.Dispatch(func() { pPostMessage.Call(hwnd, wmClose, 0, 0) }) }()
	return okRes("restarting")
}

func later(f func()) { go func() { time.Sleep(500 * time.Millisecond); w.Dispatch(f) }() }

func upFinish(id int) hostRes {
	hostMu.Lock()
	u := ups[id]
	delete(ups, id)
	hostMu.Unlock()
	if u == nil {
		return errRes(errors.New("NO_UPLOAD"))
	}
	b := u.buf.Bytes()
	switch u.kind {
	case "patch":
		if _, err := paketYama(baseDir, b, metaStr(u.meta, "targetSha256"), metaInt(u.meta, "targetSize")); err != nil {
			return errRes(err)
		}
	case "full":
		if isSetup(u.meta) {
			return runSetup(b, u.meta)
		}
		if sz := metaInt(u.meta, "targetSize"); sz > 0 && int64(len(b)) != sz {
			return errRes(errors.New("BAD_SIZE"))
		}
		if _, err := paketKur(baseDir, b, metaStr(u.meta, "targetSha256")); err != nil {
			return errRes(err)
		}
	default:
		return errRes(errors.New("BAD_KIND"))
	}
	later(restart)
	return okRes("restarting")
}

func agentDir() string {
	ad := os.Getenv("APPDATA")
	if ad == "" {
		ad = baseDir
	}
	return filepath.Join(ad, "FalconCekirdek", "agent")
}

var agentKey = regexp.MustCompile(`[^\w@.-]`)

func agentOp(op, key, js string) hostRes {
	file := func(k string) string {
		k = agentKey.ReplaceAllString(k, "_")
		if len(k) > 120 {
			k = k[:120]
		}
		return filepath.Join(agentDir(), k+".json")
	}
	switch op {
	case "read":
		out := map[string]string{}
		ents, err := os.ReadDir(agentDir())
		if err != nil {
			return okRes(out)
		}
		for i, e := range ents {
			if i >= 200 || !strings.HasSuffix(e.Name(), ".json") {
				continue
			}
			if b, err := os.ReadFile(filepath.Join(agentDir(), e.Name())); err == nil {
				out[strings.TrimSuffix(e.Name(), ".json")] = string(b)
			}
		}
		return okRes(out)
	case "write":
		if len(js) > 2e6 || !json.Valid([]byte(js)) {
			return errRes(errors.New("BAD_JSON"))
		}
		os.MkdirAll(agentDir(), 0755)
		if err := atomikYaz(file(key), []byte(js)); err != nil {
			return errRes(errors.New("NO_WRITE"))
		}
		return okRes(true)
	case "remove":
		os.Remove(file(key))
		return okRes(true)
	}
	return errRes(errors.New("BAD_OP"))
}

// hostJS: window.fcHost (sayfanın betiklerinden ÖNCE her açılışta eklenir).
const hostJS = `(function(){
if (window.fcHost) return;
var INFO = %s;
var cbs = {}, prog = {}, subs = [], seq = 0;
window.__fcDone = function (id, r) { var f = cbs[id]; delete cbs[id]; if (f) f(r); };
window.__fcNetProg = function (id, d, fin) { var f = prog[id]; if (f) try { f({ done: d, finished: !!fin }); } catch (e) {} };
window.__fcWinState = function (s) { subs.slice().forEach(function (f) { try { f(s); } catch (e) {} }); };
var mainErr = [];
window.__fcMainErr = function (m) { mainErr.forEach(function (f) { try { f(m); } catch (e) {} }); };
function fail(r) { var e = new Error((r && r.error) || 'ERR'); e.code = (r && r.error) || 'ERR'; return e; }
function unwrap(p) { return Promise.resolve(p).then(function (r) { if (typeof r === 'string') r = JSON.parse(r); if (r && r.ok) return r.data; throw fail(r); }); }
function wait(id, start) { return new Promise(function (res, rej) { cbs[id] = function (r) { r && r.ok ? res(r.data) : rej(fail(r)); }; Promise.resolve(start()).catch(function (e) { delete cbs[id]; rej(e); }); }); }
function b64(u8) { var s = '', CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
async function download(url, onp) {
  var id = 1000000 + (++seq); prog[id] = onp;
  try {
    var r = await wait(id, function () { return window.fcNetStart(id, String(url)); });
    var out = new Uint8Array(r.size), off = 0;
    while (off < r.size) { var c = unb64(await unwrap(window.fcNetRead(id, off, 1048576))); if (!c.length) throw fail({ error: 'SHORT_READ' }); out.set(c, off); off += c.length; }
    return out;
  } finally { delete prog[id]; try { window.fcNetFree(id); } catch (e) {} }
}
async function send(kind, bytes, meta) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  var id = await unwrap(window.fcUpBegin(kind, JSON.stringify(meta || {})));
  for (var i = 0; i < bytes.length; i += 786432) await unwrap(window.fcUpChunk(id, b64(bytes.subarray(i, i + 786432))));
  return wait(id, function () { return window.fcUpFinish(id); });
}
window.fcHost = {
  kind: 'webview2', platform: 'win32', version: INFO.version, shell: 'go-webview2', nativeVersion: INFO.native,
  window: {
    minimize: function () { return window.fcWin('min'); }, half: function () { return window.fcWin('half'); },
    toggleFullscreen: function () { return window.fcWin('fs'); }, close: function () { return window.fcWin('close'); },
    getState: function () { return window.fcWin('state'); },
    onState: function (cb) { subs.push(cb); return function () { subs = subs.filter(function (x) { return x !== cb; }); }; }
  },
  update: { channel: 'win-app', applyPatch: function (b, m) { return send('patch', b, m); }, installFull: function (b, m) { return send('full', b, m); } },
  net: { download: download },
  agent: {
    read: function () { return unwrap(window.fcAgent('read', '', '')); },
    write: function (k, j) { return unwrap(window.fcAgent('write', String(k), String(j))); },
    remove: function (k) { return unwrap(window.fcAgent('remove', String(k), '')); }
  },
  onMainError: function (cb) { mainErr.push(cb); return function () { mainErr = mainErr.filter(function (x) { return x !== cb; }); }; },
  openExternal: function (u) { if (/^https:\/\//i.test(String(u))) return window.mahzenOpen(String(u)); }
};
})();`

func hostBind(p paketBilgi) {
	curInfo = p
	info, _ := json.Marshal(map[string]interface{}{"version": p.Version, "native": nativeVersion})
	w.Bind("fcWin", func(a string) winState {
		if a == "state" {
			return state()
		}
		return winAction(a)
	})
	w.Bind("fcNetStart", func(id int, u string) bool { safeGo(id, func() hostRes { return netDownload(id, u) }); return true })
	w.Bind("fcNetRead", func(id, off, n int) hostRes { return netRead(id, off, n) })
	w.Bind("fcNetFree", func(id int) bool { hostMu.Lock(); delete(dls, id); hostMu.Unlock(); return true })
	w.Bind("fcUpBegin", func(kind, meta string) hostRes {
		var m map[string]interface{}
		if json.Unmarshal([]byte(meta), &m) != nil {
			m = map[string]interface{}{}
		}
		hostMu.Lock()
		upSeq++
		id := 2000000 + upSeq
		ups[id] = &upload{kind: kind, meta: m}
		hostMu.Unlock()
		return okRes(id)
	})
	w.Bind("fcUpChunk", func(id int, b64 string) hostRes {
		b, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			return errRes(errors.New("BAD_CHUNK"))
		}
		hostMu.Lock()
		defer hostMu.Unlock()
		u := ups[id]
		if u == nil {
			return errRes(errors.New("NO_UPLOAD"))
		}
		if u.buf.Len()+len(b) > 512<<20 {
			return errRes(errors.New("TOO_BIG"))
		}
		u.buf.Write(b)
		return okRes(u.buf.Len())
	})
	w.Bind("fcUpFinish", func(id int) bool { safeGo(id, func() hostRes { return upFinish(id) }); return true })
	w.Bind("fcAgent", func(op, key, js string) hostRes { return agentOp(op, key, js) })
	w.Init(fmt.Sprintf(hostJS, string(info)))
}

// dumanBind: CI açılış testi (Mahzen.exe --duman=sonuc.json). Sayfa açıldıktan sonra çekirdeğin ve üst çubuğun durumunu yazar, programı kapatır.
func dumanBind(out string) {
	yaz := func(s string) {
		os.WriteFile(out, []byte(s), 0644)
		w.Dispatch(func() { pPostMessage.Call(hwnd, wmClose, 0, 0) })
	}
	w.Bind("fcDuman", func(js string) bool { yaz(js); return true })
	go func() {
		time.Sleep(90 * time.Second)
		os.WriteFile(out, []byte(`{"timeout":true}`), 0644)
		os.Exit(3)
	}()
	w.Init(`window.addEventListener('load', function () { var errs = []; window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  setTimeout(function () { window.fcWin('state').then(function (st) { window.fcDuman(JSON.stringify({
    fcHost: !!window.fcHost, version: window.fcHost && window.fcHost.version, app: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '',
    core: !!(window.FC && FC.updater), host: window.FC && FC.host && FC.host.kind, mahzen: !!window.MahzenFC, legacy: !!(window.MahzenFC && MahzenFC.legacy),
    topbar: document.querySelectorAll('#topbar .topbar-actions').length, win: document.querySelectorAll('#topbar .win-controls button').length,
    fullscreen: !!(st && st.fullscreen), origin: location.origin, errors: errs })); }); }, 4000); });`)
}
