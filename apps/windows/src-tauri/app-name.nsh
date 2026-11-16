; Keep GermanWords installation/upgrade keys; localize only user-visible names.
!define APP_DISPLAY_NAME "德语单词助手"
Caption "${APP_DISPLAY_NAME}"
UninstallCaption "${APP_DISPLAY_NAME}"
Var AppNameInstalled

!macro RenameAppShortcut original renamed
  !insertmacro IsShortcutTarget "${original}" "$INSTDIR\germanwords.exe"
  Pop $R0
  ${If} $R0 = 1
    !insertmacro IsShortcutTarget "${renamed}" "$INSTDIR\germanwords.exe"
    Pop $R0
    ${If} $R0 = 1
      Delete "${original}"
    ${Else}
      Rename "${original}" "${renamed}"
    ${EndIf}
  ${EndIf}
!macroend

Function RenameAppShortcuts
  !insertmacro RenameAppShortcut "$SMPROGRAMS\GermanWords.lnk" "$SMPROGRAMS\${APP_DISPLAY_NAME}.lnk"
  !insertmacro RenameAppShortcut "$DESKTOP\GermanWords.lnk" "$DESKTOP\${APP_DISPLAY_NAME}.lnk"
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "${APP_DISPLAY_NAME}"
  StrCpy $AppNameInstalled 1
  Call RenameAppShortcuts
!macroend

; The finish page may create a desktop shortcut after POSTINSTALL.
Function .onGUIEnd
  ${If} $AppNameInstalled = 1
    Call RenameAppShortcuts
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_PREUNINSTALL
  ; Updater uninstall mode preserves existing shortcuts, as does Tauri itself.
  ${If} $UpdateMode != 1
    !insertmacro IsShortcutTarget "$SMPROGRAMS\${APP_DISPLAY_NAME}.lnk" "$INSTDIR\germanwords.exe"
    Pop $R0
    ${If} $R0 = 1
      Delete "$SMPROGRAMS\${APP_DISPLAY_NAME}.lnk"
    ${EndIf}
    !insertmacro IsShortcutTarget "$DESKTOP\${APP_DISPLAY_NAME}.lnk" "$INSTDIR\germanwords.exe"
    Pop $R0
    ${If} $R0 = 1
      Delete "$DESKTOP\${APP_DISPLAY_NAME}.lnk"
    ${EndIf}
  ${EndIf}
!macroend
