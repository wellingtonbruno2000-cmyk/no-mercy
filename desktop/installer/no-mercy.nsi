; Instalador do NO MERCY para Windows (NSIS). Instala por usuário, sem precisar de administrador.
Unicode true
SetCompressor /SOLID lzma
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!ifndef SRC
  !define SRC "..\release\win-unpacked"
!endif
!ifndef OUTFILE
  !define OUTFILE "..\release\NO-MERCY-Setup-${VERSION}.exe"
!endif

!define APPNAME "NO MERCY"
!define EXE "NO MERCY.exe"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\NOMERCY"

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\NO MERCY"
InstallDirRegKey HKCU "Software\NOMERCY" "InstallDir"
RequestExecutionLevel user
BrandingText "NO MERCY ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1046 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1046 "FileDescription" "Instalador do NO MERCY"
VIAddVersionKey /LANG=1046 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1046 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1046 "LegalCopyright" "NO MERCY"

!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Bem-vindo ao NO MERCY"
!define MUI_WELCOMEPAGE_TEXT "Jogo de cartas estratégico: preveja exatamente quantas rodadas vai vencer.$\r$\n$\r$\nJogue online com amigos ou offline contra bots.$\r$\n$\r$\nClique em Avançar para continuar."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o NO MERCY agora"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Section "Instalar"
  ; Fecha o jogo se estiver aberto (para poder substituir os arquivos numa atualização).
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  File "..\build\icon.ico"
  WriteUninstaller "$INSTDIR\Desinstalar NO MERCY.exe"

  CreateShortCut "$DESKTOP\NO MERCY.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\icon.ico" 0
  CreateDirectory "$SMPROGRAMS\NO MERCY"
  CreateShortCut "$SMPROGRAMS\NO MERCY\NO MERCY.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\NO MERCY\Desinstalar NO MERCY.lnk" "$INSTDIR\Desinstalar NO MERCY.exe" "" "$INSTDIR\icon.ico" 0

  WriteRegStr HKCU "Software\NOMERCY" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "NO MERCY"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Desinstalar NO MERCY.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  Delete "$DESKTOP\NO MERCY.lnk"
  RMDir /r "$SMPROGRAMS\NO MERCY"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\NOMERCY"
SectionEnd
