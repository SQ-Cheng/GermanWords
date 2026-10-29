# 更新与反馈协议

本文说明客户端行为和数据格式。签名备份、构建、发布命令、通道迁移及故障恢复统一见 [维护与发布要求](requirements.md)。

## 目录与权限

维护端通过 `GERMANWORDS_RELEASE_UPLOAD_URL` 或 `--upload-url` 提供可写目录分享链接，不打包进客户端。客户端使用 `shared/app-config.json` 中的只读分享链接；两者必须指向同一发布目录。反馈使用独立的仅上传入口，`feedbackUploadPath` 与该入口对应，不能把分享目录当成存储根目录 `/`。

每版独占子目录，固定更新索引位于根目录：

```text
Release/
  update-stable.json
  update-beta.json
  <version>/
    GermanWords-Android-<version>.apk
    GermanWords-Windows-<version>-x86_64-Setup.exe
    GermanWords-Windows-<version>-x86_64-Setup.exe.sig
    GermanWords-Web-<version>.zip
    SHA256SUMS.txt
```

## 更新索引与客户端

两个索引格式相同，包含 Windows 的 `version` / `channel` / `notes` / `platforms` 和 Android 的 RSA `payload` / `signature`。payload 是 Base64 编码的 UTF-8 JSON，包含 schema、channel、versionName、versionCode、notes 与 android 安装包信息；其原始字节由 SHA256withRSA 签名。APK 路径必须为 `<version>/GermanWords-Android-<version>.apk`，并带大小与 SHA-256。Windows 的各架构条目提供下载 URL 与 Tauri 安装包签名，不共用 Android 的安装协议。

「词库与设置 → 接收更新」可选择「正式版」或「测试版（含正式版）」。两者分别读取 `shared/app-config.json` 的 `manifestPaths.stable` / `.beta`，沿用同一只读分享目录。首次使用默认采用安装包配置的 `channel`，之后保存用户选择，覆盖升级不重置；更新偏好不属于学习备份。反馈中的 app.channel 仍表示安装包的构建通道。

正式入口只发布 `X.Y.Z`；测试入口接收 `X.Y.Z-beta.N` 及后续正式版。发布正式版时生成两份索引，指向同一批安装包，但各自签名载荷的 channel 必须分别是 stable / beta，兼容旧 Android 客户端。若测试入口已有更高版本，维护工具保留它。版本后缀、构建默认通道、索引载荷通道和 GitHub Pre-release 标记须按维护要求配套设置。

Android 校验签名载荷 schema 和所选 channel，同时要求 versionCode 与版本名都高于已安装版；Windows 使用官方插件按语义版本比较，并限制正式通道不接受预发布版本。切到正式通道不会降级已安装的更高测试版，而是等待更高正式版。Windows 接受缺少顶层 channel 的旧 beta 索引，有该字段时要求匹配所选通道。

两端启动时尝试后台检查，每个通道分别记录成功时间，距上次成功检查不足 24 小时则跳过自动检查；手动检查和切换通道不受此限制。切换后立即检查并撤销旧通道提示；下载、安装或 Android 存在待安装包时暂不允许切换。没有常驻定时轮询；检查失败不更新成功时间，无网络不影响学习。入口不存在或不可读属于检查失败，不显示为已是最新。Android 返回前台只恢复待安装流程。发现新版后展示说明，由用户确认下载。

- Android 下载后校验大小、SHA-256、包名、versionCode 和应用签名，再交给系统 PackageInstaller。等待安装来源授权时保存待安装状态，返回或重启时重新校验缓存后继续，取消会清理。
- Windows 用 Tauri 官方更新插件验签，成功后关闭应用并运行 NSIS 安装器。学习数据存放在独立用户目录。
- 网络请求限制为配置来源主机的 HTTPS 默认端口；GET 重定向次数有限，反馈 POST 不重放。学习 WebView 资源和导航保持本地，不为更新放开远程页面。
- 客户端使用“检查更新”“下载更新”“意见反馈”等通用措辞，不显示服务商、URL、令牌或原始网络异常。

浏览器版不读取原生更新索引，不调用安装器或原生反馈发送器。“下载新版”打开 GitHub 发布页，由用户备份后替换完整离线包；静态托管由维护者替换全部文件。浏览器 ZIP 可作为同版本额外附件，不扩展原生更新协议。

## 发布器边界

`tools/publish-update.py` 使用 Android SDK 和官方 Minisign 校验输入，再按构建通道生成索引：测试版仅更新 beta，正式版更新 stable 并同步 beta。APK 不超过 32 MiB，每份索引不超过 64 KiB。上传前读取目标旧索引，拒绝版本或 versionCode 回退；正式版同步 beta 时保留更高测试版本。上传 API 通过 `relative_path` 创建版本子目录，工具从客户端只读入口读回核验全部安装包后，最后替换根索引并逐一读回；同名版本包内容不可变。GitHub 发布独立执行。具体命令与迁移要求见维护要求。

## 意见反馈

用户提交 1～4000 字内容时才联网，失败保留文字。每份 UTF-8 JSON 包含 `schema: 1`、`submittedAtUnixMs`（UTC Unix 毫秒）、`message`、`app`、`device`。应用信息包括平台、版本、versionCode 和通道；设备信息包括系统、架构及 WebView User-Agent，Android 另有 SDK、厂商和型号。Windows User-Agent 不用于精确区分 Windows 10/11。

不读取或上传用户名、设备唯一标识、文件路径、词库、星标和备份，不自动采集日志。关闭窗口不撤回已经提交的任务。仅上传入口需要随客户端分发，可被提取，隐藏服务商名称不等于保密或反滥用；必须与维护端发布写权限隔离。

`shared/feedback.js` / `.css` 负责公共表单；`mobile.js` / `desktop.js` 注入发送函数并处理平台交互。Android FeedbackSender 与 Windows feedback.rs 生成元数据和上传单文件，网络队列不阻塞本地导入。相关边界见 [架构](architecture.md)。
