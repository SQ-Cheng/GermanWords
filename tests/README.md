# 测试

测试代码位于本目录；Android 设备测试按 Gradle 标准放在 `apps/android/app/src/androidTest/`，不会打包进主应用。`tools/` 保留构建和维护发布工具，日志和截图位于 Git 忽略的 `artifacts/`。

仓库根目录执行（Node.js 22+）：

```powershell
node tests/test-parser.mjs
node tests/test-engine.mjs
node tests/test-theme.mjs
node tests/test-playback.mjs
node tests/test-vocabulary.mjs
node tests/test-marks.mjs
```

真机测试需要 JDK 17+、Android SDK 35、Python 3 和已授权 USB 调试的设备。允许手机的 USB 安装提示，设置 `ANDROID_HOME` 或将 `adb` 加入 PATH：

```powershell
cd apps/android
.\gradlew.bat assembleDebug assembleDebugAndroidTest
cd ../..
python tests/android/run-device.py DEVICE_SERIAL
```

只有一台设备时可以省略序列号。脚本安装主 APK 与独立测试 APK，验证实际 WebView、原生音频和文件导入。字体测试调用应用自身的缩放路径，不修改手机全局字号；测试还原学习设置和导入目录，并将截图从应用临时缓存取回 `artifacts/`。测试后可执行 `adb uninstall cn.study.germanwords.test` 移除测试 APK。

可选的 Windows 浏览器回归需要本机安装 Edge，并安装本目录锁定的开发依赖：

```powershell
python tools/build-windows.py
pnpm --dir tests install --frozen-lockfile
pnpm --dir tests test:browser
```

`browser.cjs` 检查源码页面和离线发布包的主题跟随、手动覆盖、重载保存、词库导入与学习交互；无需修改生产代码或启动外部服务。真机测试会短暂覆盖学习状态和主题，然后还原；触摸测试期间应保持手机解锁并让应用留在前台。

本轮回归还覆盖双端 460 词混合与唯一 ID、原单元星标隔离、搜索与乱序组合、Android 混合进度恢复、无结果保留位置、Windows 卡片点击仅播放一次、语速保存与当前录音变速、同名导入录音的来源匹配。真机测试实际读取 MediaPlayer 的倍速，结束时还原原有语速偏好。

架构审查补充：共享星标存储覆盖旧 JSON、外部恢复、损坏数据、存储失败的内存回退；Windows 还验证卡片和列表隐藏答案、音频取消、逐行揭晓/星标/键盘以及词库替换清空旧状态。

Windows 桌面迁移后，先运行 `python tools/build-windows.py`，浏览器回归同时覆盖源码与生成前端。`node tests/legacy-migration.cjs` 验证在原 file:// 地址替换迁移页后保留并导出旧星标/主题/语速。`tests/desktop.cjs` 针对真实 Tauri WebView2 检查内置词库、备份校验、重载保持、主题和 480–1120px 响应布局；按 `apps/windows/README.md` 启动隔离测试实例后执行，测试专用调试端口不进入正式运行方式。

旧 PowerShell 更新器已随架构迁移移除，不再维护其测试；历史验证记录保留。当前安装器、真实云盘升级和验证边界见 `artifacts/windows-desktop-verification.md`。
