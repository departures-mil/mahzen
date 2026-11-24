//go:build windows

// Mahzen masaüstü kabuğu (yerel sürüm 4, Mahzen 3.9.0+: ortak çekirdek).
// Sayfa https://mahzen.local/index.html adresinden açılır (kayıtlar bu kökene bağlıdır, DEĞİŞTİRME),
// WebView2 verisi exe'nin yanındaki veri/ klasöründe durur (3.8'deki gibi).
// Arayüz web paketidir (paket.go): exe'ye gömülü paket.zip ilk açılışta web/ altına açılır; güncellemeler
// GitHub Releases latest.json → win-app (FCD1 yaması ya da tam zip) ve win-setup (NSIS kurulum) ile gelir (host.go).
// Her açılışta tam ekran. Wi‑Fi eşitleme sunucusu lan.go.
package main

import (
	_ "embed"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
	"github.com/jchv/go-webview2/pkg/edge"
)

// nativeVersion: eski kanalın (guncelleme/exe.json) kabuk numarası. 3.8 ve önceki kabuklar (3) bu exe'yi exe.json'dan
// "daha yeni" görüp kendilerini bununla değiştirir (köprü: araclar/kopru.py).
const nativeVersion = 4

// paket.zip: arayüz (web paketi, win-app kanalının tam dosyası). araclar/paket.js üretir.
//
//go:embed paket.zip
var embeddedBundle []byte

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	shell32  = syscall.NewLazyDLL("shell32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	dwmapi   = syscall.NewLazyDLL("dwmapi.dll")

	pGetWindowLongPtr    = user32.NewProc("GetWindowLongPtrW")
	pSetWindowLongPtr    = user32.NewProc("SetWindowLongPtrW")
	pSetWindowPos        = user32.NewProc("SetWindowPos")
	pGetWindowPlacement  = user32.NewProc("GetWindowPlacement")
	pSetWindowPlacement  = user32.NewProc("SetWindowPlacement")
	pMonitorFromWindow   = user32.NewProc("MonitorFromWindow")
	pGetMonitorInfo      = user32.NewProc("GetMonitorInfoW")
	pShowWindow          = user32.NewProc("ShowWindow")
	pIsZoomed            = user32.NewProc("IsZoomed")
	pPostMessage         = user32.NewProc("PostMessageW")
	pGetWindowRect       = user32.NewProc("GetWindowRect")
	pMessageBox          = user32.NewProc("MessageBoxW")
	pShellExecute        = shell32.NewProc("ShellExecuteW")
	pOpenProcess         = kernel32.NewProc("OpenProcess")
	pWaitForSingleObject = kernel32.NewProc("WaitForSingleObject")
	pCloseHandle         = kernel32.NewProc("CloseHandle")
	pDwmGetWindowAttr    = dwmapi.NewProc("DwmGetWindowAttribute")
)

const (
	gwlStyle           = ^uintptr(15) // -16
	wsOverlappedWindow = 0x00CF0000
	wsPopup            = 0x80000000
	wsVisible          = 0x10000000
	swpNoZOrder        = 0x0004
	swpNoOwnerZOrder   = 0x0200
	swpFrameChanged    = 0x0020
	swMaximize         = 3
	swMinimize         = 6
	swRestore          = 9
	wmClose            = 0x0010
	monitorNearest     = 2
)

type rect struct{ L, T, R, B int32 }
type monitorInfo struct {
	Size          uint32
	Monitor, Work rect
	Flags         uint32
}
type windowPlacement struct {
	Length, Flags, ShowCmd uint32
	MinPos, MaxPos         [2]int32
	Normal                 rect
	Device                 rect
}

var (
	baseDir    string
	w          webview2.WebView
	hwnd       uintptr
	fullscreen bool
	half       bool
	savedPl    windowPlacement
	havePl     bool
)

func u16(s string) uintptr { p, _ := syscall.UTF16PtrFromString(s); return uintptr(unsafe.Pointer(p)) }

func messageBox(title, text string) {
	pMessageBox.Call(0, u16(text), u16(title), 0x10)
}

func openExternal(u string) {
	l := strings.ToLower(u)
	if !(strings.HasPrefix(l, "https://") || strings.HasPrefix(l, "http://") || strings.HasPrefix(l, "mailto:") || strings.HasPrefix(l, "tel:")) {
		return
	}
	pShellExecute.Call(0, u16("open"), u16(u), 0, 0, 1)
}

func monitorRects() (mon, work rect) {
	h, _, _ := pMonitorFromWindow.Call(hwnd, monitorNearest)
	mi := monitorInfo{Size: uint32(unsafe.Sizeof(monitorInfo{}))}
	pGetMonitorInfo.Call(h, uintptr(unsafe.Pointer(&mi)))
	return mi.Monitor, mi.Work
}

func setFullscreen(on bool) {
	if on == fullscreen {
		return
	}
	st, _, _ := pGetWindowLongPtr.Call(hwnd, gwlStyle)
	if on {
		savedPl = windowPlacement{Length: uint32(unsafe.Sizeof(windowPlacement{}))}
		r, _, _ := pGetWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(&savedPl)))
		havePl = r != 0
		m, _ := monitorRects()
		pSetWindowLongPtr.Call(hwnd, gwlStyle, (st&^wsOverlappedWindow)|wsPopup|wsVisible)
		pSetWindowPos.Call(hwnd, 0, uintptr(m.L), uintptr(m.T), uintptr(m.R-m.L), uintptr(m.B-m.T), swpNoZOrder|swpNoOwnerZOrder|swpFrameChanged)
	} else {
		pSetWindowLongPtr.Call(hwnd, gwlStyle, (st&^wsPopup)|wsOverlappedWindow|wsVisible)
		if havePl {
			pSetWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(&savedPl)))
		}
		pSetWindowPos.Call(hwnd, 0, 0, 0, 0, 0, swpNoZOrder|swpNoOwnerZOrder|swpFrameChanged|0x0001|0x0002)
	}
	fullscreen = on
}

// setHalf: "Orta" — çalışma alanının %50 × %50'si, ortalanmış (çerçeveli pencere); tekrar basınca tam ekrana döner.
func setHalf() {
	setFullscreen(false)
	if z, _, _ := pIsZoomed.Call(hwnd); z != 0 {
		pShowWindow.Call(hwnd, swRestore)
	}
	_, wk := monitorRects()
	ww, wh := (wk.R-wk.L)/2, (wk.B-wk.T)/2
	x, y := wk.L+(wk.R-wk.L-ww)/2, wk.T+(wk.B-wk.T-wh)/2
	pSetWindowPos.Call(hwnd, 0, uintptr(x), uintptr(y), uintptr(ww), uintptr(wh), swpNoZOrder|swpNoOwnerZOrder)
	half = true
}

type winState struct {
	Fullscreen bool `json:"fullscreen"`
	Half       bool `json:"half"`
	Max        bool `json:"max"`
}

func state() winState {
	z, _, _ := pIsZoomed.Call(hwnd)
	return winState{Fullscreen: fullscreen, Half: half, Max: z != 0}
}

func notifyState() {
	b, _ := jsonMarshal(state())
	w.Eval("window.__fcWinState&&window.__fcWinState(" + string(b) + ")")
}

// winAction: min, half (orta / geri tam ekran), fs (tam ekran ↔ büyütülmüş pencere), close
func winAction(a string) winState {
	switch a {
	case "min":
		pShowWindow.Call(hwnd, swMinimize)
	case "half":
		if half {
			half = false
			setFullscreen(true)
		} else {
			setHalf()
		}
	case "fs":
		half = false
		if fullscreen {
			setFullscreen(false)
			pShowWindow.Call(hwnd, swMaximize)
		} else {
			setFullscreen(true)
		}
	case "close":
		pPostMessage.Call(hwnd, wmClose, 0, 0)
	}
	go func() { time.Sleep(150 * time.Millisecond); w.Dispatch(notifyState) }()
	return state()
}

func exePath() string { p, _ := os.Executable(); return p }

// restart starts a fresh copy (which waits for this process to end) and quits.
// A pending Mahzen.exe.new (native update) is swapped in first: a running exe can be renamed on Windows.
func restart() {
	exe := exePath()
	if fi, err := os.Stat(exe + ".new"); err == nil && fi.Size() > 0 {
		os.Remove(exe + ".old")
		if os.Rename(exe, exe+".old") == nil {
			if os.Rename(exe+".new", exe) != nil {
				os.Rename(exe+".old", exe)
			}
		}
	}
	cmd := exec.Command(exe, "--bekle", strconv.Itoa(os.Getpid()))
	cmd.Dir = baseDir
	cmd.Start()
	pPostMessage.Call(hwnd, wmClose, 0, 0)
}

func waitForPid(pid int) {
	h, _, _ := pOpenProcess.Call(0x00100000, 0, uintptr(pid)) // SYNCHRONIZE
	if h != 0 {
		pWaitForSingleObject.Call(h, 15000)
		pCloseHandle.Call(h)
	}
}

func chromium(v webview2.WebView) *edge.Chromium {
	f := reflect.ValueOf(v).Elem().FieldByName("browser")
	f = reflect.NewAt(f.Type(), unsafe.Pointer(f.UnsafeAddr())).Elem()
	c, _ := f.Interface().(*edge.Chromium)
	return c
}

func main() {
	baseDir = filepath.Dir(exePath())
	duman := ""
	for i, a := range os.Args {
		if strings.HasPrefix(a, "--duman=") { // CI açılış testi: sayfa durumunu dosyaya yazar ve kapanır
			duman = strings.TrimPrefix(a, "--duman=")
		}
		if a == "--bekle" && i+1 < len(os.Args) {
			if pid, err := strconv.Atoi(os.Args[i+1]); err == nil {
				waitForPid(pid)
			}
		}
	}
	exe := exePath()
	for i := 0; i < 5; i++ { // left over from a native update
		if _, err := os.Stat(exe + ".old"); err != nil || os.Remove(exe+".old") == nil {
			break
		}
		time.Sleep(400 * time.Millisecond)
	}
	os.Remove(exe + ".new")

	bundle, berr := paketHazirla(baseDir, embeddedBundle)
	if berr != nil {
		messageBox("Mahzen", "Mahzen arayüzü açılamadı ("+berr.Error()+"). Program klasörüne yazılabildiğinden emin olun:\n"+baseDir)
		return
	}
	dir := paketDizin(baseDir, bundle)
	w = webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		DataPath:  filepath.Join(baseDir, "veri"),
		WindowOptions: webview2.WindowOptions{
			Title: "Mahzen", Width: 1200, Height: 800, IconId: 2, Center: true,
		},
	})
	if w == nil {
		messageBox("Mahzen", "Mahzen açılamadı. Microsoft Edge WebView2 Runtime yüklü olmalı:\nhttps://go.microsoft.com/fwlink/p/?LinkId=2124703")
		return
	}
	defer w.Destroy()
	hwnd = uintptr(w.Window())
	c := chromium(w)
	if c == nil {
		messageBox("Mahzen", "WebView2 başlatılamadı.")
		return
	}
	c.AcceleratorKeyCallback = func(vk uint) bool {
		if vk == 0x7A { // F11
			half = false
			setFullscreen(!fullscreen)
			notifyState()
			return true
		}
		return false
	}
	c.SetPermission(edge.CoreWebView2PermissionKindNotifications, edge.CoreWebView2PermissionStateAllow)
	if wv3 := c.GetICoreWebView2_3(); wv3 == nil || wv3.SetVirtualHostNameToFolderMapping("mahzen.local", dir, edge.COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW) != nil {
		messageBox("Mahzen", "WebView2 sürümü eski. Lütfen Microsoft Edge WebView2 Runtime'ı güncelleyin.")
		return
	}

	w.Bind("mahzenOpen", openExternal)
	hostBind(bundle)
	lanBind()
	if duman != "" {
		dumanBind(duman)
	}

	setFullscreen(true)
	w.Navigate("https://mahzen.local/index.html?r=" + strconv.FormatInt(time.Now().UnixNano(), 36))
	w.Run()
	applyOnExit()
}

// hiddenAttr: kurulum programı gizli pencerede (SW_HIDE) çalışır — güncellemede pencere görünmez.
func hiddenAttr() *syscall.SysProcAttr { return &syscall.SysProcAttr{HideWindow: true} }
