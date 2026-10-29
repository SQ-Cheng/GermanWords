# 测试

测试代码位于本目录；Android 设备测试按 Gradle 标准放在 `apps/android/app/src/androidTest/`，不会打包进主应用。`tools/` 保留构建和维护发布工具，日志和截图位于 Git 忽略的 `artifacts/`。

仓库根目录执行（Node.js 22+）：

```powershell
node tests/test-parser.mjs
node tests/test-library.mjs
node tests/test-engine.mjs
node tests/test-theme.mjs
node tests/test-playback.mjs
node tests/test-vocabulary.mjs
node tests/test-marks.mjs
node tests/test-desktop.mjs
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

`browser.cjs` 检查生成的 Windows 前端的主题跟随、手动覆盖、重载保存、词库导入与学习交互；无需修改生产代码或启动外部服务。真机测试会短暂覆盖学习状态和主题，然后还原；触摸测试期间应保持手机解锁并让应用留在前台。

公共回归覆盖德语（1）460 词与德语（2）381 词、混合唯一 ID、课程与原单元星标隔离、搜索与乱序组合、Android 混合进度恢复、无结果保留位置、Windows 卡片点击仅播放一次、语速保存与当前录音变速、同名导入录音的来源匹配。`test-library.mjs` 检查课程选择、稳定导入键、重名、存储失败与禁止跨内置课程匹配录音。真机测试实际读取 MediaPlayer 的倍速，结束时还原原有语速偏好。

更新通道回归覆盖 Windows 偏好保存、各通道节流和撤销旧提示；发布器验证正式版生成双份有效签名、兼容旧 beta 载荷、保留更高测试版本及拒绝索引回退。Android `UpdateChecks` 验证通道和版本顺序，Rust 验证正式通道拒绝预发布版本。测试不上传真实安装包或改动线上索引；完整云端升级须在实际发布时按维护要求验证。

架构审查补充：共享星标存储覆盖旧 JSON、外部恢复、损坏数据、存储失败的内存回退；Windows 还验证卡片和列表隐藏答案、音频取消、逐行揭晓/星标/键盘以及词库替换清空旧状态。

Windows 桌面迁移后，先运行 `python tools/build-windows.py`，再测试生成前端。`node tests/legacy-migration.cjs` 验证在原 file:// 地址替换迁移页后保留并导出旧星标/主题/语速。`tests/desktop.cjs` 针对真实 Tauri WebView2 检查内置词库、备份校验、重载保持、主题和 480–1120px 响应布局；按 `apps/windows/README.md` 启动隔离测试实例后执行，测试专用调试端口不进入正式运行方式。

免安装浏览器版使用同一套锁定依赖。在仓库根目录执行：

```powershell
python tools/build-web.py
pnpm --dir tests install --frozen-lockfile
pnpm --dir tests exec playwright install firefox webkit
pnpm --dir tests test:web
```

Windows 上的 Chromium 使用本机 Edge，其他系统先执行 `pnpm --dir tests exec playwright install chromium`；Firefox 与 WebKit 由 Playwright 安装。可在安装和运行时使用相同的 `PLAYWRIGHT_BROWSERS_PATH` 自定义浏览器存放位置。浏览器二进制、Node 依赖和测试服务不会进入应用包。

构建后先运行 `python tests/test_web_bundle.py`，验证 ZIP 中 17 份词表、459 份录音与公共原件逐字节一致，嵌入 XLSX 数据也一致，确认不含原生适配/配置，再解压到忽略的临时目录。`web.cjs` 对该解压包执行三种引擎的本地文件与 HTTP 子目录回归；临时 HTTP 服务仅用于测试，生产使用无需服务。覆盖 460 词/例句/录音匹配、真实播放与变速、搜索、自测、列表、备份导入导出及校验、重载保存、存储不可写降级、静音预览、快捷键、文件导入及 480–1280px/大字号布局。学习过程断言无外部请求；反馈/更新只验证外链，不提交数据。需要实际显示浏览器窗口时执行 `node tests/web.cjs --headed`。

`course-ui.cjs` 供浏览器回归与真实 Tauri 回归复用，实际操作课程选择器，验证德语（2）的 9 份词表、381 个唯一词条、缺失录音状态、课程星标隔离、重启恢复和新旧备份兼容。两种桌面测试分别通过真实文件输入导入词表，验证切换两门课程后导入键与星标保持。Android 设备入口通过触摸和系统选择控件切换课程，检查导入词表/星标全局有效、200% 字号的德语（2）长词和课程菜单边界；测试组件仍仅在独立测试 APK 中。

`test-engine.mjs` 还通过原生 manifest 与资源读取适配模拟备份恢复，实际解析词表，验证跨课程恢复时清空旧搜索、完整显示新词表，并兼容未记录课程的旧备份。

本地文件回归阻断全部 HTTP(S) 请求；Chromium、Firefox 同时启用离线模拟。Windows WebKit 的离线模拟会连 file:// 导航也阻止，故仅采用网络请求阻断。另独立复现了 Windows WebKit 在非 ASCII 本地路径下的 MP3 播放失败（普通音频页同样失败）：该组合明确记录媒体限制，其余功能继续测试，HTTP 模式必须实际播放。不能把此项记为完整离线音频通过。WebKit 在 Windows 上的回归不等同于 macOS Safari 实测；实际 macOS、Linux、iOS 设备尚未验证。参见 [Playwright 的引擎与平台说明](https://playwright.dev/docs/browsers)。

旧 PowerShell 更新器已随架构迁移移除，不再维护其测试；历史验证记录保留。当前安装器、真实云盘升级和验证边界见 `artifacts/windows-desktop-verification.md`。

合并前 P2 回归：`test-desktop.mjs` 检查备份的内存存储回退、同步启动目录及按需读取错误；引擎测试检查过期读取不能覆盖切换后的课程。Android 引擎测试检查主题/语速备份、旧格式兼容和非法字段不覆盖。真机入口还运行 `UpdateChecks`，验证更新信息签名、待安装记录跨管理器恢复、过期任务拒绝保存、损坏缓存拒绝及取消清理，不打开系统安装器。

发布工具回归执行 `python tests/test_updates.py`，无需上传权限或真实私钥。完整签名测试需要官方 Minisign（PATH 或 `MINISIGN`），没有安装时会明确跳过该测试。Rust 重定向策略执行 `cargo test --locked`（在 `apps/windows/src-tauri/`），静态检查执行 `cargo clippy --locked -- -D warnings`。

导航与反馈回归：浏览器检查翻页边界、列表定位、放大后的圆形按钮，以及反馈失败保留内容/重试/不显示原始异常；使用注入发送函数，不上传真实反馈。Android 真机入口验证实际点击翻页、进度条拖动、100～200% 字号、反馈对话框和返回操作；原生元数据与输入限制由设备测试和 Rust 单元测试覆盖。发布工具回归验证一个双端签名索引、版本子目录上传及索引最后发布，不进行真实发布。实际反馈端到端上传须由维护者单独提交明确标记的测试内容，避免每次回归产生垃圾反馈。

进度条回归在鼠标/手指仍按住时验证目标词条已经显示、没有播放或待播放的音频，松手后只触发最终词条一次；Android 另检查预览不提前保存位置、返回原位置后松手仍能播放。真机字号回归检查卡片侧边按钮保持圆形并与内容区分离。

单行词形回归在 Windows 窄窗口中使用放大的字号检查长词完整显示，放宽窗口后字号恢复；Android 真机在 100～200% 字号及 320dp 宽度下检查长词不折行、不溢出。

需要实际上传时，在已安装应用启用测试 CDP 连接后，显式执行 `node tests/feedback-live.cjs http://127.0.0.1:PORT android --send-test-report`（Windows 改为 `windows`）。每次只提交一份标明“自动化验证、可删除”的 JSON；不会随普通测试自动执行。Android 根据调试目标的可见状态选取前台 WebView，避免误操作后台 Activity。

4.2.1 合并前检查补充：原生 Windows 回归必须实际点击反馈入口，覆盖 CSP 下的事件绑定；发布器拒绝调试 APK 与大于 64 KiB 的更新索引。版本显示从公共配置注入生成页面。
