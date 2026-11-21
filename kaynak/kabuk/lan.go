// Wi‑Fi ile internetsiz eşitleme — masaüstü tarafı (yerel ağ sunucusu + istemci).
// Telefon aynı ağdan bağlanır; eşitleme isteği sayfaya (window.__lanReq) iletilir, cevap mahzenLanReply ile gelir.
// Kayıtlar sayfada ana şifreyle şifrelenir; burada yalnızca taşınır.
package main

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const lanApp = "mahzen"
const lanAlpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

type lanPrefs struct {
	Key string `json:"lanKey"`
	On  bool   `json:"lanOn"`
}

var (
	lanMu      sync.Mutex
	lanSrv     *http.Server
	lanPort    int
	lanBad     int
	lanLocked  time.Time
	lanSeq     int
	lanPending = map[string]chan string{}
)

func lanFile() string { return filepath.Join(baseDir, "wifi-esitleme.json") }

func lanLoad() lanPrefs {
	var p lanPrefs
	if b, err := os.ReadFile(lanFile()); err == nil {
		json.Unmarshal(b, &p)
	}
	if p.Key == "" {
		p.Key = lanNewKey()
		lanSave(p)
	}
	return p
}

func lanSave(p lanPrefs) {
	b, _ := json.Marshal(p)
	tmp := lanFile() + ".tmp"
	if os.WriteFile(tmp, b, 0644) == nil {
		os.Rename(tmp, lanFile())
	}
}

func lanNewKey() string {
	b := make([]byte, 8)
	rand.Read(b)
	s := make([]byte, 8)
	for i := range b {
		s[i] = lanAlpha[int(b[i])%len(lanAlpha)]
	}
	return string(s)
}

func lanBasePort() int {
	var h uint32
	for _, c := range lanApp {
		h = h*31 + uint32(c)
	}
	return 47000 + int(h%900)
}

func lanIPs() []string {
	out := []string{}
	ifs, _ := net.Interfaces()
	for _, i := range ifs {
		if i.Flags&net.FlagUp == 0 || i.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := i.Addrs()
		for _, a := range addrs {
			if n, ok := a.(*net.IPNet); ok {
				if ip := n.IP.To4(); ip != nil && !ip.IsLinkLocalUnicast() {
					out = append(out, ip.String())
				}
			}
		}
	}
	rank := func(ip string) int {
		switch {
		case strings.HasPrefix(ip, "192.168."):
			return 0
		case strings.HasPrefix(ip, "10."):
			return 1
		case strings.HasPrefix(ip, "172."):
			return 2
		}
		return 3
	}
	sort.SliceStable(out, func(a, b int) bool { return rank(out[a]) < rank(out[b]) })
	return out
}

func lanInfo() string {
	p := lanLoad()
	lanMu.Lock()
	on := lanSrv != nil
	port := lanPort
	lanMu.Unlock()
	host, _ := os.Hostname()
	b, _ := json.Marshal(map[string]interface{}{"ok": true, "on": on, "ips": lanIPs(), "port": port, "key": p.Key, "app": lanApp, "name": host})
	return string(b)
}

func lanSend(rw http.ResponseWriter, status int, body string) {
	rw.Header().Set("Content-Type", "application/json; charset=utf-8")
	rw.Header().Set("Cache-Control", "no-store")
	rw.WriteHeader(status)
	io.WriteString(rw, body)
}

// askPage hands a sync request to the page and waits for its answer (mahzenLanReply).
func askPage(body string) string {
	lanMu.Lock()
	lanSeq++
	rid := "r" + strconv.Itoa(lanSeq)
	ch := make(chan string, 1)
	lanPending[rid] = ch
	lanMu.Unlock()
	w.Dispatch(func() {
		w.Eval("window.__lanReq && window.__lanReq(" + jsStr(rid) + "," + jsStr(body) + ")")
	})
	select {
	case r := <-ch:
		return r
	case <-time.After(150 * time.Second):
		lanMu.Lock()
		delete(lanPending, rid)
		lanMu.Unlock()
		return `{"ok":false,"error":"timeout"}`
	}
}

func jsStr(s string) string { b, _ := json.Marshal(s); return string(b) }

func lanHandle(rw http.ResponseWriter, r *http.Request) {
	lanMu.Lock()
	locked := time.Now().Before(lanLocked)
	lanMu.Unlock()
	if locked {
		lanSend(rw, 429, `{"ok":false,"error":"locked"}`)
		return
	}
	key := r.Header.Get("X-Lan-Key")
	if key == "" {
		key = r.URL.Query().Get("k")
	}
	if key != lanLoad().Key {
		lanMu.Lock()
		lanBad++
		if lanBad >= 15 {
			lanBad = 0
			lanLocked = time.Now().Add(10 * time.Minute)
		}
		lanMu.Unlock()
		lanSend(rw, 403, `{"ok":false,"error":"key"}`)
		return
	}
	lanMu.Lock()
	lanBad = 0
	lanMu.Unlock()
	switch {
	case r.URL.Path == "/lan/ping":
		host, _ := os.Hostname()
		b, _ := json.Marshal(map[string]interface{}{"ok": true, "app": lanApp, "name": host, "v": 1})
		lanSend(rw, 200, string(b))
	case r.URL.Path == "/lan/sync" && r.Method == http.MethodPost:
		body, err := io.ReadAll(io.LimitReader(r.Body, 300<<20))
		if err != nil {
			lanSend(rw, 400, `{"ok":false}`)
			return
		}
		lanSend(rw, 200, askPage(string(body)))
	default:
		lanSend(rw, 404, `{"ok":false}`)
	}
}

func lanStart() string {
	lanMu.Lock()
	if lanSrv != nil {
		lanMu.Unlock()
		return lanInfo()
	}
	lanMu.Unlock()
	var ln net.Listener
	var err error
	port := lanBasePort()
	for i := 0; i < 9; i++ {
		ln, err = net.Listen("tcp4", "0.0.0.0:"+strconv.Itoa(port+i))
		if err == nil {
			port += i
			break
		}
	}
	if err != nil {
		return `{"ok":false,"error":"port"}`
	}
	srv := &http.Server{Handler: http.HandlerFunc(lanHandle), ReadHeaderTimeout: 20 * time.Second}
	lanMu.Lock()
	lanSrv, lanPort = srv, port
	lanMu.Unlock()
	go srv.Serve(ln)
	p := lanLoad()
	if !p.On {
		p.On = true
		lanSave(p)
	}
	return lanInfo()
}

func lanStop() string {
	lanMu.Lock()
	if lanSrv != nil {
		lanSrv.Close()
		lanSrv = nil
	}
	lanMu.Unlock()
	p := lanLoad()
	p.On = false
	lanSave(p)
	return `{"ok":true}`
}

var lanClient = &http.Client{}

func lanHTTP(method, url, body string, timeoutMs int, key string) string {
	if timeoutMs <= 0 {
		timeoutMs = 60000
	}
	var rd io.Reader
	if body != "" {
		rd = bytes.NewBufferString(body)
	}
	req, err := http.NewRequest(method, url, rd)
	if err != nil {
		return `{"status":0,"body":"url"}`
	}
	req.Header.Set("X-Lan-Key", key)
	if body != "" {
		req.Header.Set("Content-Type", "application/json; charset=utf-8")
	}
	c := &http.Client{Timeout: time.Duration(timeoutMs) * time.Millisecond, Transport: &http.Transport{Proxy: nil}}
	res, err := c.Do(req)
	if err != nil {
		b, _ := json.Marshal(map[string]interface{}{"status": 0, "body": err.Error()})
		return string(b)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 300<<20))
	b, _ := json.Marshal(map[string]interface{}{"status": res.StatusCode, "body": string(data)})
	return string(b)
}

func lanFind(port int, key, app string) string {
	mine := map[string]bool{}
	hosts := []string{}
	for _, ip := range lanIPs() {
		mine[ip] = true
	}
	for _, ip := range lanIPs() {
		base := ip[:strings.LastIndex(ip, ".")]
		for i := 1; i < 255; i++ {
			h := base + "." + strconv.Itoa(i)
			if !mine[h] {
				hosts = append(hosts, h)
			}
		}
	}
	var found string
	var fm sync.Mutex
	jobs := make(chan string)
	var wg sync.WaitGroup
	for t := 0; t < 48; t++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for h := range jobs {
				fm.Lock()
				done := found != ""
				fm.Unlock()
				if done {
					continue
				}
				var r struct {
					Status int    `json:"status"`
					Body   string `json:"body"`
				}
				json.Unmarshal([]byte(lanHTTP("GET", fmt.Sprintf("http://%s:%d/lan/ping", h, port), "", 700, key)), &r)
				if r.Status == 200 && strings.Contains(r.Body, `"app":"`+app+`"`) {
					fm.Lock()
					if found == "" {
						found = h
					}
					fm.Unlock()
				}
			}
		}()
	}
	for _, h := range hosts {
		jobs <- h
	}
	close(jobs)
	wg.Wait()
	b, _ := json.Marshal(map[string]interface{}{"ok": found != "", "host": found})
	return string(b)
}

// lanCallback answers a page call made as fn(cbId, ...) without blocking the window.
func lanCallback(cb string, f func() string) {
	go func() {
		res := f()
		w.Dispatch(func() { w.Eval("window.__lanCb && window.__lanCb(" + jsStr(cb) + "," + jsStr(res) + ")") })
	}()
}

func lanBind() {
	w.Bind("mahzenLanInfo", lanInfo)
	w.Bind("mahzenLanReply", func(rid, body string) bool {
		lanMu.Lock()
		ch := lanPending[rid]
		delete(lanPending, rid)
		lanMu.Unlock()
		if ch != nil {
			ch <- body
		}
		return true
	})
	w.Bind("mahzenLanServe", func(cb string) bool { lanCallback(cb, lanStart); return true })
	w.Bind("mahzenLanStop", func(cb string) bool { lanCallback(cb, lanStop); return true })
	w.Bind("mahzenLanResetKey", func(cb string) bool {
		lanCallback(cb, func() string { p := lanLoad(); p.Key = lanNewKey(); lanSave(p); return lanInfo() })
		return true
	})
	w.Bind("mahzenLanHttp", func(cb, method, url, body string, timeoutMs int, key string) bool {
		lanCallback(cb, func() string { return lanHTTP(method, url, body, timeoutMs, key) })
		return true
	})
	w.Bind("mahzenLanFind", func(cb string, port int, key, app string) bool {
		lanCallback(cb, func() string { return lanFind(port, key, app) })
		return true
	})
	if lanLoad().On {
		go lanStart()
	}
}
