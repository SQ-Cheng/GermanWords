# 软件内更新来源调研

日期：2026-10-17（Asia/Shanghai）。基线：4.1.0-beta.1，Android versionCode 5。分支：`codex/update-source-investigation`。本轮只验证下载来源并记录方案，不改变应用权限、联网行为或安装流程，不上传云盘文件。

## 结论

无需自建云服务器。固定 HTTPS 更新信息文件 + 按版本发布的完整安装包，适合目前项目。清华云盘可作为下载来源，但当前分享链接不适合直接承担两端共同的元数据读取入口。

建议 GitHub Releases 继续维护发布记录和原始安装包；从同一次发布生成一份版本信息 JSON，放在固定的静态 HTTPS 地址（当前可先用 GitHub raw，后续也可用 GitHub Pages）。云盘作为国内下载入口或镜像，存放与 Releases 字节一致的版本化 APK / ZIP。JSON 中填写真实可访问的下载链接与校验值，不抓取分享网页、不接入网盘账号或维护私有 Token。

若只做 Android 小规模分发，云盘内固定路径的 JSON 和版本化 APK 也可作为首版方案；目前测得的 CORS 限制不会阻止 Android 原生联网。但应先上传真实 JSON/APK 验证文件覆盖、分享期限、下载限制与移动网络访问。没有证据证明网盘承诺长期提供软件分发服务，需保留 GitHub 发布入口。

## 实测

用户提供的匿名分享：<https://cloud.tsinghua.edu.cn/d/361a8eccb1624c65ae26/>。

| 请求或场景 | 结果 |
| --- | --- |
| 不登录、不带 Cookie 打开目录 | HTTP 200，文件夹名为 `test`，允许下载 |
| 公开目录列表 | HTTP 200，目前只有 `/test.md`，12 字节，没有更新 JSON 或安装包 |
| 文件原文入口 `files/?p=%2Ftest.md&raw=1` | HTTP 302 → 200，直接返回 12 字节内容，非登录页或 HTML 预览 |
| 文件下载入口 `files/?p=%2Ftest.md&dl=1` | HTTP 302 → 200，附件响应，同样返回 12 字节 |
| 当前 Windows 源码页面中以 Edge 执行 `fetch` 访问以上两种入口 | 均被 CORS 拦截；首跳 302 没有 `Access-Control-Allow-Origin`。最终文件响应虽有 `*`，仍不能修复首跳限制 |
| Windows 页面读取 GitHub raw 的仓库 README | HTTP 200，内容可被 `fetch` 读取 |
| 当前电脑匿名读取 GitHub Releases API | HTTP 200；但不建议每次启动直接查询 API，存在按来源 IP 的匿名限流 |

测试文件内容为 `# test test` 加换行（12 字节）。两种 HTTP 下载结果 SHA-256 均为：

```text
480c0e34d72ed42db448475cfcbb94ca4ac64955dd2d5ee4a099d78700ed67ee
```

可以手动验证的稳定文件入口：

- [原文](https://cloud.tsinghua.edu.cn/d/361a8eccb1624c65ae26/files/?p=%2Ftest.md&raw=1)
- [下载](https://cloud.tsinghua.edu.cn/d/361a8eccb1624c65ae26/files/?p=%2Ftest.md&dl=1)

应保存分享入口 + 文件路径，正常跟随 HTTPS 重定向；不要将一次重定向得到的下载地址写死。最终文件当前返回 `Cache-Control: max-age=3600`，不能假设覆盖文件后所有缓存立即刷新。包文件应使用带版本的名称、不原地替换；更新 JSON 采用重新验证或缓存失效策略，并限制检查频率。

这些结果来自当前电脑网络和 Edge，不代表已经验证手机移动网络、长期可用性、实际 APK 完整下载/安装或覆盖 JSON 后的刷新。目录中还没有这些文件，因此不能声称端到端自动更新已经可用。

## 最小产品行为

1. 启动后异步检查小型更新 JSON；缓存节流（例如每天一次），超时/离线不阻挡学习。设置中提供「检查更新」。
2. 分开维护稳定版和 Beta 通道，用户选择接收测试版；不要用字符串大小直接比较版本。Android 以递增 `versionCode` 判断升级，展示 `versionName`；Windows 同样使用明确的构建序号或正确的版本比较规则。
3. 发现新版本只提示版本和说明，由用户选择下载，不在每次启动自动拉取完整安装包。
4. Android 原生层下载完整 APK，校验 SHA-256、包名、版本和签名与已安装应用匹配，再进入系统安装流程；需要用户授权安装来源及安装确认。现有 WebView 仍只访问本地资源，更新联网不通过放开 WebView 导航实现。
5. Windows 当前是浏览器打开的静态离线目录，首版提供更新提示和 ZIP 下载，由用户解压替换；不为了自动覆盖目录引入 Electron、后台服务或更新器进程。浏览器文件写入需要用户授权。

共享层只放版本信息格式、校验与比较规则；各端分别负责联网、提示和安装/下载。现有 Android 没有 INTERNET 或 REQUEST_INSTALL_PACKAGES 权限，真正实现时应明确增加，并保持网络失败不影响离线功能。

## 发布维护

每版先构建并验证签名、包名与版本号，再上传不可变的版本化 APK/ZIP，确认下载字节和 SHA-256 正确，最后发布更新 JSON，避免客户端读到尚未上传的包。云盘如作镜像，必须与 Releases 同包同校验值。已有 Beta 沿用历史开发证书，后续正式签名迁移需要单独规划，更新器不能绕过 Android 签名约束。

下一步如决定实施，可先在该测试目录放入真正的更新 JSON 和当前已发布 APK（不伪造高版本），验证原生下载与校验，再实现更新检查及用户确认流程。当前没有写入云盘或改动任何主程序。

## 资料

- [GitHub Pages 静态托管](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Releases API](https://docs.github.com/en/rest/releases/releases)：`latest` 不包含预发布版；Beta 通道应单独指定。
- [GitHub API 限流](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)：匿名按来源 IP 计数，常规上限为每小时 60 次，不在客户端内嵌仓库访问 Token。
- [Android 版本管理](https://developer.android.com/studio/publish/versioning)
- [Android 签名与升级](https://developer.android.com/studio/publish/app-signing)
- [Android 安装会话](https://developer.android.com/reference/android/content/pm/PackageInstaller.SessionParams)
- [浏览器文件访问授权](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- [Seafile 分享权限与链接](https://help.seafile.com/sharing_collaboration/sharing_files_and_folders/)
