# 结构与维护约定

这是两个静态 Web 界面与一个 Android 原生宿主组成的离线项目，无服务端、前端框架或主程序 npm 依赖。

| 层 | 文件与职责 |
| --- | --- |
| 公共数据 | `shared/parser.js` 读取 XLSX；`vocabulary.js` 搜索、组合词表并附加来源；`audio.js` 建索引和匹配录音，不播放、不创建 URL |
| 公共偏好 | `shared/marks.js` 保存原单元星标，存储不可用时降级到会话内存；`playback.js` 保存并校验语速，不访问页面 |
| 公共主题 | `shared/theme.js` 保存主题并设置页面主题；`theme.css` 定义配色 |
| Android 界面 | `apps/android/app/src/main/assets/web/`：HTML、CSS、`engine.js` 负责学习交互；`mobile.js` 负责 Android 偏好、进度、触摸和原生桥接适配 |
| Android 宿主 | `MainActivity.java` 负责本地资源拦截、文件选择/导入、原生解压、MediaPlayer 与系统栏；平台 API 不进入共享层 |
| Windows 界面 | `apps/windows/De_words_helper.html` 负责结构，`windows.css` 负责布局，`app.js` 负责交互和浏览器音频 |
| 构建与测试 | `tools/` 只放构建工具，`tests/` 放 Node/浏览器/设备入口，标准 `src/androidTest/` 放设备测试组件；产物和本机配置不入库 |

脚本采用普通 script 加载，源码和独立包均能直接打开。解析器与词表组合是录音匹配器的依赖；HTML 在客户端逻辑之前加载公共脚本。Android Gradle 与 Windows 构建脚本自动复制公共 JS/CSS，修改共享文件无需手动同步副本。

两端保留各自界面与平台会话状态，不用通用控制器强行统一列表、音频播放器和 Android 备份流程。重复的解析、搜索、录音匹配、星标和语速规则则只在共享层维护。浏览器 Blob URL 的创建/释放由客户端负责，原生播放器的生命周期由 Java 宿主负责。

单单元词条保留旧 ID 和原有存储键；混合词条使用单元名和旧 ID 组成唯一 ID，并保留 `sourceBook` / `sourceRoot`。星标仍写回原单元；混合顺序和位置单独保存。读取全部成功且请求仍是最新时才切换词表，失败和过期读取不得覆盖当前学习状态。搜索词不持久化，无结果不得抹除已保存位置。

修改共享数据规则后运行 `pnpm --dir tests test`；修改任一界面还需跑浏览器回归或真机测试，入口见 `tests/README.md`。Android 版本号在 `app/build.gradle`，两端页面版本同步更新；versionCode 必须递增。发布 APK 使用 Release 构建并验证签名；Windows 包必须包含 HTML、客户端与公共 JS/CSS 和 `words/`，不能只分发 HTML。Beta 暂沿用历史开发证书以允许升级，正式发布前需制定独立签名迁移方案。
