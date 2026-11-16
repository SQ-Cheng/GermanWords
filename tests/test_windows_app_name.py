"""Exercise the NSIS naming hooks in isolated folders and a disposable HKCU key.

Usage: python tests/test_windows_app_name.py MAKENSIS NSIS_SUPPORT_DIRECTORY
Build a Windows NSIS package first to generate utils.nsh in the support directory.
"""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import uuid
import winreg

ROOT = Path(__file__).resolve().parents[1]
compiler, support = map(Path, sys.argv[1:])
config = json.loads((ROOT / 'apps/windows/src-tauri/tauri.conf.json').read_text(encoding='utf-8'))
assert config['productName'] == 'GermanWords'
assert config['identifier'] == 'cn.study.germanwords'
assert config['app']['windows'][0]['title'] == '德语单词助手'
key = 'Software\\GermanWords-Test-' + uuid.uuid4().hex
with tempfile.TemporaryDirectory(prefix='windows-name-', dir=ROOT / 'tmp') as directory:
    folder = Path(directory).resolve()
    assert folder.is_relative_to((ROOT / 'tmp').resolve())
    # Redirect only shell-folder roots; execute the production hook logic verbatim.
    hook = (ROOT / 'apps/windows/src-tauri/app-name.nsh').read_text(encoding='utf-8')
    assert 'NSIS_HOOK_PREUNINSTALL' not in hook, 'Cancelled uninstall must preserve shortcuts'
    hook = hook.replace('$SMPROGRAMS', '$INSTDIR\\start').replace('$DESKTOP', '$INSTDIR\\desktop')
    (folder / 'app-name.nsh').write_text(hook, encoding='utf-8-sig')
    for name in ['germanwords.exe', 'foreign.exe']:
        (folder / name).write_bytes(b'MZ test fixture, never executed')
    script = r'''
Unicode true
!include MUI2.nsh
!include FileFunc.nsh
!include x64.nsh
!include "Win\COM.nsh"
!include "Win\Propkey.nsh"
!include "@SUPPORT@\utils.nsh"
!define UNINSTKEY "@KEY@"
!include "@FOLDER@\app-name.nsh"
Name "GermanWords naming test"
OutFile "@FOLDER@\test.exe"
RequestExecutionLevel user
SilentInstall silent
Var UpdateMode
Section
  SetShellVarContext current
  StrCpy $INSTDIR "@FOLDER@"
  CreateDirectory "$INSTDIR\start"
  CreateDirectory "$INSTDIR\desktop"
  CreateShortcut "$INSTDIR\start\GermanWords.lnk" "$INSTDIR\germanwords.exe"
  ; Cancelling an installer must not rename pre-existing shortcuts.
  Call .onGUIEnd
  IfFileExists "$INSTDIR\start\GermanWords.lnk" +2 0
    Goto failed
  !insertmacro NSIS_HOOK_POSTINSTALL
  ReadRegStr $R1 SHCTX "${UNINSTKEY}" "DisplayName"
  StrCmp $R1 "${APP_DISPLAY_NAME}" +2 0
    Goto failed
  IfFileExists "$INSTDIR\start\${APP_DISPLAY_NAME}.lnk" +2 0
    Goto failed
  ; Existing localized links and late finish-page desktop links are retained.
  CreateShortcut "$INSTDIR\start\GermanWords.lnk" "$INSTDIR\germanwords.exe"
  CreateShortcut "$INSTDIR\desktop\GermanWords.lnk" "$INSTDIR\germanwords.exe"
  Call .onGUIEnd
  IfFileExists "$INSTDIR\start\GermanWords.lnk" failed 0
  IfFileExists "$INSTDIR\desktop\${APP_DISPLAY_NAME}.lnk" +2 0
    Goto failed
  ; Never rename/delete a shortcut pointing at a different application.
  CreateShortcut "$INSTDIR\start\GermanWords.lnk" "$INSTDIR\foreign.exe"
  Call RenameAppShortcuts
  !insertmacro IsShortcutTarget "$INSTDIR\start\GermanWords.lnk" "$INSTDIR\foreign.exe"
  Pop $R1
  StrCmp $R1 1 +2 0
    Goto failed
  ; A localized filename owned by another application must not be overwritten.
  CreateShortcut "$INSTDIR\desktop\GermanWords.lnk" "$INSTDIR\germanwords.exe"
  CreateShortcut "$INSTDIR\desktop\${APP_DISPLAY_NAME}.lnk" "$INSTDIR\foreign.exe"
  Call RenameAppShortcuts
  !insertmacro IsShortcutTarget "$INSTDIR\desktop\${APP_DISPLAY_NAME}.lnk" "$INSTDIR\foreign.exe"
  Pop $R1
  StrCmp $R1 1 +2 0
    Goto failed
  IfFileExists "$INSTDIR\desktop\GermanWords.lnk" +2 0
    Goto failed
  ; Run a real uninstaller: cancellation/update preserve links; success cleans ours.
  WriteUninstaller "$INSTDIR\uninstall.exe"
  ExecWait '"$INSTDIR\uninstall.exe" /S /CANCEL _?=$INSTDIR'
  IfFileExists "$INSTDIR\start\${APP_DISPLAY_NAME}.lnk" +2 0
    Goto failed
  ExecWait '"$INSTDIR\uninstall.exe" /S /UPDATE _?=$INSTDIR'
  IfFileExists "$INSTDIR\start\${APP_DISPLAY_NAME}.lnk" +2 0
    Goto failed
  CreateShortcut "$INSTDIR\desktop\${APP_DISPLAY_NAME}.lnk" "$INSTDIR\foreign.exe"
  ExecWait '"$INSTDIR\uninstall.exe" /S _?=$INSTDIR'
  IfFileExists "$INSTDIR\start\${APP_DISPLAY_NAME}.lnk" failed 0
  !insertmacro IsShortcutTarget "$INSTDIR\desktop\${APP_DISPLAY_NAME}.lnk" "$INSTDIR\foreign.exe"
  Pop $R1
  StrCmp $R1 1 +2 0
    Goto failed
  FileOpen $R1 "$INSTDIR\result.txt" w
  FileWrite $R1 "PASS"
  FileClose $R1
  Goto done
  failed:
    FileOpen $R1 "$INSTDIR\result.txt" w
    FileWrite $R1 "FAIL"
    FileClose $R1
  done:
    DeleteRegKey SHCTX "${UNINSTKEY}"
SectionEnd

Section Uninstall
  ${GetParameters} $R2
  ClearErrors
  ${GetOptions} $R2 "/CANCEL" $R3
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
  ClearErrors
  ${GetOptions} $R2 "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}
  !insertmacro NSIS_HOOK_POSTUNINSTALL
SectionEnd
'''.replace('@SUPPORT@', str(support.resolve())).replace('@FOLDER@', str(folder)).replace('@KEY@', key)
    source = folder / 'test.nsi'
    source.write_text(script, encoding='utf-8-sig')
    try:
        subprocess.run([str(compiler), '/V2', str(source)], check=True, capture_output=True)
        subprocess.run([str(folder / 'test.exe')], check=True, timeout=30,
                       creationflags=subprocess.CREATE_NO_WINDOW)
        assert (folder / 'result.txt').read_text() == 'PASS'
    finally:
        try:
            winreg.DeleteKeyEx(winreg.HKEY_CURRENT_USER, key, access=winreg.KEY_WOW64_32KEY)
        except FileNotFoundError:
            pass
print('PASS: stable upgrade identity, localized registration/shortcuts, cancel/finish/update/uninstall paths, and unrelated shortcut preservation.')
