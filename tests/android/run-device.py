"""Install and run real-device smoke tests; accommodates Xiaomi foreground launch rules."""
from pathlib import Path
import os, shutil, subprocess, time, sys

root=Path(__file__).resolve().parents[2]
sdk=os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
executable=shutil.which('adb') or (str(Path(sdk)/'platform-tools/adb.exe') if sdk else None)
if not executable: raise SystemExit('Add adb to PATH or set ANDROID_HOME to the Android SDK directory.')
adb=[executable]+(['-s',sys.argv[1]] if len(sys.argv)>1 else [])
def run(*args):
    result=subprocess.run(adb+list(args),capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=60)
    print(result.stdout+result.stderr,flush=True)
    result.check_returncode()
run('install','-r',str(root/'apps/android/app/build/outputs/apk/debug/app-debug.apk'))
run('install','-r',str(root/'apps/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'))
# Start the test content provider once; Xiaomi may hide unlaunched packages from other apps.
run('shell','content','query','--uri','content://cn.study.germanwords.test.documents/tree/root/document/root/children')
run('shell','input','keyevent','KEYCODE_WAKEUP')
process=subprocess.Popen(adb+['shell','am','instrument','-w','cn.study.germanwords.test/cn.study.germanwords.SmokeInstrumentation'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
time.sleep(2)
run('shell','am','start','-W','-n','cn.study.germanwords/.MainActivity')
try:
    raw=process.communicate(timeout=120)[0]
except subprocess.TimeoutExpired:
    process.terminate()
    raise
output=raw.decode('utf-8',errors='replace')
(root/'artifacts').mkdir(exist_ok=True)
(root/'artifacts/device-test.log').write_text(output,encoding='utf-8')
print(output,flush=True)
for name in ['qa-font-100.png','qa-font-130.png','qa-font-150.png','qa-font-200.png','qa-list-200.png','qa-theme-dark.png','qa-library-200.png','qa-course-german2.png','qa-course-200.png','qa-course-imports.png']:
    result=subprocess.run(adb+['exec-out','run-as','cn.study.germanwords','cat','cache/test-screenshots/'+name],capture_output=True,timeout=10)
    if result.returncode==0:
        (root/'artifacts'/name).write_bytes(result.stdout)
        subprocess.run(adb+['shell','run-as','cn.study.germanwords','rm','cache/test-screenshots/'+name],capture_output=True,timeout=10)
if 'FAIL:' in output or output.count('PASS:')<2: raise SystemExit(1)
