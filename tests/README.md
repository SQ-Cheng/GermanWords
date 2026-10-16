# 测试

测试代码位于本目录；Android 设备测试按 Gradle 标准放在 `apps/android/app/src/androidTest/`，不会打包进主应用。`tools/` 仅保留构建工具，日志和截图位于 Git 忽略的 `artifacts/`。

仓库根目录执行（Node.js 22+）：

```powershell
node tests/test-parser.mjs
node tests/test-engine.mjs
```

真机测试需要 JDK 17+、Android SDK 35、Python 3 和已授权 USB 调试的设备。允许手机的 USB 安装提示，设置 `ANDROID_HOME` 或将 `adb` 加入 PATH：

```powershell
cd apps/android
.\gradlew.bat assembleDebug assembleDebugAndroidTest
cd ../..
python tests/android/run-device.py DEVICE_SERIAL
```

只有一台设备时可以省略序列号。脚本安装主 APK 与独立测试 APK，验证实际 WebView、原生音频和文件导入。字体测试调用应用自身的缩放路径，不修改手机全局字号；测试还原学习设置和导入目录，并将截图从应用临时缓存取回 `artifacts/`。测试后可执行 `adb uninstall cn.study.germanwords.test` 移除测试 APK。
