; Atalhos com o ícone do NO MERCY (área de trabalho e menu Iniciar).
!macro customInstall
  CreateShortCut "$DESKTOP\NO MERCY.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\resources\icon.ico" 0
  CreateDirectory "$SMPROGRAMS\NO MERCY"
  CreateShortCut "$SMPROGRAMS\NO MERCY\NO MERCY.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\resources\icon.ico" 0
!macroend

!macro customUnInstall
  Delete "$DESKTOP\NO MERCY.lnk"
  Delete "$SMPROGRAMS\NO MERCY\NO MERCY.lnk"
  RMDir "$SMPROGRAMS\NO MERCY"
!macroend
