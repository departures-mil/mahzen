; Mahzen — Windows kurulum programı (NSIS 3, kullanıcı başına, tek tık; tr / en / ar).
;   makensis /DVERSION=3.9.0 /DEXE=..\..\cikti\Mahzen.exe /DOUT=..\..\cikti\Mahzen-Setup-3.9.0.exe kaynak\kurulum\mahzen.nsi
; Varsayılan klasör %LOCALAPPDATA%\Programs\Mahzen. Program içinden güncellemede kabuk kurulumu /D=<kendi klasörü> ile çalıştırır,
; böylece kayıtlar (veri\ klasörü, wifi-esitleme.json) yerinde kalır. Kaldırma veri\ klasörünü SİLMEZ.
Unicode true
ManifestDPIAware true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

!ifndef VERSION
  !error "VERSION tanımlı değil"
!endif
!ifndef EXE
  !define EXE "..\..\cikti\Mahzen.exe"
!endif
!ifndef OUT
  !define OUT "..\..\cikti\Mahzen-Setup-${VERSION}.exe"
!endif

Name "Mahzen"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\Mahzen"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "Mahzen ${VERSION}"
ShowInstDetails nevershow
AutoCloseWindow true
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=0 "ProductName" "Mahzen"
VIAddVersionKey /LANG=0 "FileDescription" "Mahzen ${VERSION} kurulum"
VIAddVersionKey /LANG=0 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=0 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=0 "CompanyName" "departures-mil"
VIAddVersionKey /LANG=0 "LegalCopyright" "departures-mil"

!define MUI_ICON "..\kabuk\mahzen.ico"
!define MUI_UNICON "..\kabuk\mahzen.ico"
!define MUI_INSTFILESPAGE_COLORS "FFFFFF 0D121D"
; tek tık: yalnız ilerleme sayfası (dil sistemin dilinden seçilir)
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Turkish"
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Arabic"

LangString Kapat ${LANG_TURKISH} "Mahzen açık. Kurulumdan önce kapatılıyor…"
LangString Kapat ${LANG_ENGLISH} "Mahzen is running. Closing it before installing…"
LangString Kapat ${LANG_ARABIC} "Mahzen مفتوح. يجري إغلاقه قبل التثبيت…"
LangString Yazilamadi ${LANG_TURKISH} "Mahzen.exe yazılamadı. Mahzen'i kapatıp yeniden deneyin."
LangString Yazilamadi ${LANG_ENGLISH} "Mahzen.exe could not be written. Close Mahzen and try again."
LangString Yazilamadi ${LANG_ARABIC} "تعذّرت كتابة Mahzen.exe. أغلق Mahzen ثم أعد المحاولة."

!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Mahzen"

Section "Mahzen" SecMain
  SetOutPath "$INSTDIR"
  ; program içinden başlatılan güncellemede eski süreç kapanırken kısa bir bekleme; yazılamazsa birkaç kez dener
  StrCpy $0 0
  retry:
  ClearErrors
  SetOverwrite on
  File "/oname=Mahzen.exe.yeni" "${EXE}"
  Delete "$INSTDIR\Mahzen.exe.eski"
  ${If} ${FileExists} "$INSTDIR\Mahzen.exe"
    Rename "$INSTDIR\Mahzen.exe" "$INSTDIR\Mahzen.exe.eski"
  ${EndIf}
  ClearErrors
  Rename "$INSTDIR\Mahzen.exe.yeni" "$INSTDIR\Mahzen.exe"
  ${If} ${Errors}
    IntOp $0 $0 + 1
    ${If} $0 < 15
      DetailPrint "$(Kapat)"
      Sleep 1000
      Goto retry
    ${EndIf}
    ${If} ${FileExists} "$INSTDIR\Mahzen.exe.eski"
      Rename "$INSTDIR\Mahzen.exe.eski" "$INSTDIR\Mahzen.exe"
    ${EndIf}
    MessageBox MB_ICONSTOP "$(Yazilamadi)" /SD IDOK
    Abort
  ${EndIf}
  Delete "$INSTDIR\Mahzen.exe.eski"
  ; arayüz exe'ye gömülüdür (paket.zip); ilk açılışta web\ altına açılır. Eski sürümün page dosyaları (app\, guncelleme\) zararsızdır.
  WriteUninstaller "$INSTDIR\Kaldir.exe"
  CreateShortcut "$DESKTOP\Mahzen.lnk" "$INSTDIR\Mahzen.exe" "" "$INSTDIR\Mahzen.exe" 0
  CreateDirectory "$SMPROGRAMS\Mahzen"
  CreateShortcut "$SMPROGRAMS\Mahzen\Mahzen.lnk" "$INSTDIR\Mahzen.exe" "" "$INSTDIR\Mahzen.exe" 0
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "Mahzen"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "departures-mil"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\Mahzen.exe"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Kaldir.exe"'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
  ; /ACMA: program kapanırken yapılan otomatik (sessiz) güncelleme — kurulumdan sonra program açılmaz
  ${GetParameters} $1
  ClearErrors
  ${GetOptions} $1 "/ACMA" $2
  ${If} ${Errors}
    Exec '"$INSTDIR\Mahzen.exe"'
  ${EndIf}
SectionEnd

Section "Uninstall"
  ; KAYITLAR SİLİNMEZ: veri\ ve wifi-esitleme.json yerinde kalır (yeniden kurulunca aynen açılır)
  Delete "$INSTDIR\Mahzen.exe"
  Delete "$INSTDIR\Kaldir.exe"
  RMDir /r "$INSTDIR\web"
  RMDir /r "$INSTDIR\app"
  Delete "$DESKTOP\Mahzen.lnk"
  RMDir /r "$SMPROGRAMS\Mahzen"
  DeleteRegKey HKCU "${UNKEY}"
  RMDir "$INSTDIR"
SectionEnd
