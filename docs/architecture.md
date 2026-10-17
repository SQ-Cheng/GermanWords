# 结构与维护约定

这是 Android Java 宿主与 Windows Tauri 宿主各自承载本地 Web 界面的离线项目，无自建服务端或前端框架。两个平台继续通过同一云盘分发。

| 层 | 文件与职责 |
| --- | --- |
| 公共数据 | `shared/parser.js` 读取 XLSX；`vocabulary.js` 搜索、组合词表并附加来源；`audio.js` 建索引和匹配录音，不播放、不创建 URL |
| 公共偏好 | `shared/marks.js` 保存原单元星标，存储不可用时降级到会话内存；`playback.js` 保存并校验语速，不访问页面 |
| 公共主题 | `shared/theme.js` 保存主题并设置页面主题；`theme.css` 定义配色 |
| Android 界面 | `apps/android/app/src/main/assets/web/`：HTML、CSS、`engine.js` 负责学习交互；`mobile.js` 负责 Android 偏好、进度、触摸和原生桥接适配 |
| Android 宿主 | `MainActivity.java` 负责本地资源拦截、文件选择/导入、原生解压、MediaPlayer 与系统栏；平台 API 不进入共享层 |
| Windows 界面 | `apps/windows/frontend/` 的 `index.html` / `windows.css` / `app.js` 负责结构、布局、学习及音频；`desktop.js` 只做桌面资源、更新交互和备份 |
| 更新配置与宿主 | `shared/app-config.json` 唯一维护版本、来源和验签公钥；Windows `src-tauri/` 官方更新插件与 Android `UpdateManager` / `UpdateReceiver` 处理平台下载和安装，不进入学习引擎 |
| 构建与测试 | `tools/` 放构建与维护发布工具，`tests/` 放 Node/浏览器/设备入口，标准 `src/androidTest/` 放设备测试组件；产物和本机配置不入库 |

脚本采用普通 script 加载，源码和生成前端可直接打开做浏览器回归；正式桌面包由 Tauri 加载内置资源。解析器与词表组合是录音匹配器的依赖；HTML 在客户端逻辑之前加载公共脚本。Android Gradle 与 Windows 构建脚本自动复制公共 JS/CSS/JSON，修改共享文件无需手动同步副本。

两端保留各自界面与平台会话状态，不用通用控制器强行统一列表、音频播放器和 Android 备份流程。重复的解析、搜索、录音匹配、星标和语速规则则只在共享层维护。浏览器 Blob URL 的创建/释放由客户端负责，原生播放器的生命周期由 Java 宿主负责。

单单元词条保留旧 ID 和原有存储键；混合词条使用单元名和旧 ID 组成唯一 ID，并保留 `sourceBook` / `sourceRoot`。星标仍写回原单元；混合顺序和位置单独保存。读取全部成功且请求仍是最新时才切换词表，失败和过期读取不得覆盖当前学习状态。搜索词不持久化，无结果不得抹除已保存位置。

修改共享数据规则后运行 `pnpm --dir tests test`；修改任一界面还需跑浏览器回归或真机测试，入口见 `tests/README.md`。双端版本号在 `shared/app-config.json`，Gradle 和 Windows 打包脚本读取；versionCode 必须递增。发布 APK 使用 Release 构建并验证签名；Windows 正式分发 NSIS 安装包，内置 HTML、公共 JS/CSS 和词库。Beta 暂沿用历史开发证书以允许升级，正式发布前需制定独立签名迁移方案。

更新共享版本与云盘来源，平台协议各自遵循现有安装边界。Android 使用 RSA 元数据与 APK 签名校验；新 Windows 使用 Tauri 官方签名更新格式与 NSIS 安装器。Windows 单独元数据入口避免破坏旧客户端，上传下载方式不变。下载能力不会扩展学习页面的网络或文件访问权限。`tools/publish-update.py` 负责维护发布，私钥和上传链接均不入库。
