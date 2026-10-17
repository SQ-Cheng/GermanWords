# 云盘更新测试

开发分支 `codex/update-source-investigation`，基线为 GitHub 已发布的 4.1.0-beta.1。本分支用 4.2.0-beta.1（versionCode 6）升级到 4.2.0-beta.2（versionCode 7），用于验证完整更新流程，尚未发布 GitHub Release。

## 使用

[云盘下载目录](https://cloud.tsinghua.edu.cn/d/361a8eccb1624c65ae26/) 包含两端 beta.1 / beta.2 完整包，以及 `update-beta.json`。想验证升级，应先使用 beta.1；直接使用 beta.2 则显示已是最新测试版。

- Windows：解压 ZIP 到普通可写目录，双击 `GermanWords.cmd`。页面立即打开，后台检查更新，发现新版本后询问是否下载安装；完成后刷新学习页面。手动检查用 `Check updates.cmd`。直接打开 HTML 可继续离线学习，但不会启动更新器。不要解压到新目录覆盖测试：更新器在原目录替换应用文件，保持浏览器存储所属的页面路径；首次仍需导入包内 `words/`。
- Android：安装 beta.1 后启动，或在侧栏点击「检查更新」。确认下载后，首次需在系统设置允许本应用安装更新，再返回，由系统确认升级。拒绝或取消不会卸载旧版本。应用数据和本地导入目录保留；不是静默安装。

两端自动检查至多每天一次，手动检查不受此限制。断网、下载服务异常或签名错误不影响离线学习；自动检查失败保持安静，手动检查显示错误。已有 4.1.0-beta.1 没有更新器，需先手动安装新的测试版本。

## 边界

`shared/app-config.json` 是双端版本、通道、下载分享、固定元数据路径和验签公钥的唯一配置；Android Gradle 与 Windows 打包脚本读取它。这里仅共享协议数据，平台安装分别留在 Java 宿主和 PowerShell，不增加 JavaScript 网络代理、常驻服务或跨平台安装框架。

Windows 使用系统自带 PowerShell 5.1 / .NET 进行 HTTPS 请求，从而不受 HTML 页面的 CORS 限制。请求带应用 User-Agent，跟随同主机 HTTPS 重定向；不把临时下载 URL 写死。更新前检查签名、通道、递增版本、大小、SHA-256、ZIP 解压路径与包内版本，失败尝试恢复备份，只有回滚也失败时保留临时备份并提示路径。更新器不删除目录里的其他用户文件，不支持断电期间的事务恢复。

Android 采用同一协议验证元数据及下载包；另外检查 APK 包名、版本与已安装应用的签名，再用系统 PackageInstaller 提交安装。WebView 仍然只访问本地资源。测试 APK 沿用既有开发证书；正式分发应使用长期维护的正式签名及迁移方案。

元数据外层为 Base64 `payload`、`signature`；签名算法 RSA PKCS#1 v1.5 / SHA-256。payload 是 UTF-8 JSON：

```json
{
  "schema": 1,
  "channel": "beta",
  "versionCode": 7,
  "versionName": "4.2.0-beta.2",
  "notes": "更新说明",
  "android": {"file": "GermanWords-Android-4.2.0-beta.2.apk", "size": 123, "sha256": "64位小写十六进制"},
  "windows": {"file": "GermanWords-Windows-4.2.0-beta.2.zip", "size": 123, "sha256": "64位小写十六进制"}
}
```

云盘可能缓存内容，客户端对元数据使用 no-cache 和时间参数；上传工具对每个文件读回校验。云盘的校外/移动网络可达性、长期限流与分享有效期仍需持续观察，不能据一次测试保证长期可用。保留 GitHub Releases 作为独立下载入口。

## 维护发布

1. 修改 `shared/app-config.json` 版本，确保 versionCode 递增。构建 Release APK 并以与既有安装相同的证书签名。
2. 用 `python tools/publish-update.py package --apk <已签名APK>` 生成两端包，默认位于忽略的 `output/releases/update-test/`。该工具不代签 APK，输入必须是刚构建的对应版本。
3. 维护机器安装 `python -m pip install -r tools/requirements-updates.txt`，它仅用于发布时签名，客户端不依赖它。保存 RSA 私钥到仓库外并安全备份。本次私钥存于维护者用户目录 `.germanwords/update-signing-key.pem`；上传链接也属于维护凭据，不写入仓库或应用。
4. 执行以下命令，上传两个包、逐一从下载入口读回比对，最后上传签名元数据。可用 `--extra <文件...>` 同时上传起始测试包。

```powershell
python tools/publish-update.py publish --key <私钥PEM路径> --upload-url <云盘上传链接> --notes "更新说明"
```

首次发布前，应从安装 beta.1 到收到 beta.2 更新完整走一遍。版本化包一旦对外分发就不要替换；更新继续递增版本，固定覆盖的文件只有 `update-beta.json`。测试准备期间的修正已重新打包校验，正式使用的包以验证记录中的 SHA-256 为准。

公钥随应用分发，私钥用于签署整个更新说明和包校验值。丢失私钥后需要手动分发带新公钥的客户端；上传链接泄露可导致文件被替换或删除，应及时更换。签名能拒绝伪造包，但不能防止云盘不可用或旧元数据重放；客户端不会降级已安装版本。

回归命令和结果见 [测试说明](../tests/README.md) 与 [本轮验证](../artifacts/cloud-update-verification.md)。
