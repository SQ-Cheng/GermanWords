$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $root 'apps/windows/update.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'Updater parse failed' }
foreach ($statement in $ast.EndBlock.Statements) {
    if ($statement -is [Management.Automation.Language.FunctionDefinitionAst]) { Invoke-Expression $statement.Extent.Text }
}
# Exercise the real validation/install functions without network, UI, or user directories.
function Read-CloudFile([string]$name,[int]$limit) { return ,$script:cloudBytes }
function Reject([scriptblock]$action,[string]$expected) {
    try { & $action } catch { if ($_.Exception.Message -like "*$expected*") { return }; throw }
    throw "Expected rejection: $expected"
}
$rsa = [Security.Cryptography.RSACryptoServiceProvider]::new(2048)
$public = $rsa.ExportParameters($false)
$config = @{channel='beta';manifestPath='/update-beta.json';publicKey=@{modulus=[Convert]::ToBase64String($public.Modulus);exponent=[Convert]::ToBase64String($public.Exponent)}}
$release = @{schema=1;channel='beta';versionCode=7;versionName='test.7';windows=@{file='GermanWords-Windows-test.7.zip';size=1;sha256=('a'*64)}}
function Envelope($value) {
    $payload = [Text.Encoding]::UTF8.GetBytes(($value | ConvertTo-Json -Depth 5 -Compress))
    return [Text.Encoding]::UTF8.GetBytes((@{payload=[Convert]::ToBase64String($payload);signature=[Convert]::ToBase64String($rsa.SignData($payload,'SHA256'))} | ConvertTo-Json -Compress))
}
$script:cloudBytes = Envelope $release
if ((Read-Update).versionCode -ne 7) { throw 'Valid signature rejected' }
$envelope = [Text.Encoding]::UTF8.GetString($script:cloudBytes) | ConvertFrom-Json
$envelope.payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('{}'))
$script:cloudBytes = [Text.Encoding]::UTF8.GetBytes(($envelope | ConvertTo-Json -Compress))
Reject { Read-Update } 'signature'
$release.channel='stable'; $script:cloudBytes=Envelope $release
Reject { Read-Update } 'information'
$release.channel='beta'; $release.windows.file='../escape.zip'; $script:cloudBytes=Envelope $release
Reject { Read-Update } 'package information'

Add-Type -AssemblyName System.IO.Compression
function Archive([hashtable]$files) {
    $stream=[IO.MemoryStream]::new()
    $zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create,$true)
    foreach($name in $files.Keys) {
        $writer=[IO.StreamWriter]::new($zip.CreateEntry($name).Open())
        $writer.Write($files[$name]);$writer.Dispose()
    }
    $zip.Dispose();$result=$stream.ToArray();$stream.Dispose();return ,$result
}
function Set-Asset([byte[]]$bytes) {
    $script:cloudBytes=$bytes
    $sha=[Security.Cryptography.SHA256]::Create()
    try { $release.windows=@{file='GermanWords-Windows-test.7.zip';size=$bytes.Length;sha256=[BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()} } finally { $sha.Dispose() }
}
$temporary=Join-Path ([IO.Path]::GetTempPath()) ('GermanWords-update-test-'+[Guid]::NewGuid())
try {
    $install=Join-Path $temporary 'install';New-Item -ItemType Directory -Path $install | Out-Null
    $configPath=Join-Path $install 'app-config.json'
    [IO.File]::WriteAllText($configPath,'{"versionCode":6,"versionName":"test.6"}')
    [IO.File]::WriteAllText((Join-Path $install 'user.txt'),'keep')
    [IO.File]::WriteAllText((Join-Path $install 'De_words_helper.html'),'old')
    Set-Asset (Archive @{'../escape.txt'='bad'})
    Reject { Install-Update $release } 'archive path'
    Set-Asset (Archive @{'app-config.json'='{"versionCode":8,"versionName":"test.8"}';'De_words_helper.html'='new'})
    Reject { Install-Update $release } 'version mismatch'
    Set-Asset (Archive @{'app-config.json'='{"versionCode":7,"versionName":"test.7"}';'De_words_helper.html'='new'})
    $release.windows.sha256='0'*64
    Reject { Install-Update $release } 'checksum'
    New-Item -ItemType Directory -Path (Join-Path $install 'zzz.txt') | Out-Null
    Set-Asset (Archive @{'app-config.json'='{"versionCode":7,"versionName":"test.7"}';'De_words_helper.html'='new';'zzz.txt'='collision'})
    $failed=$false
    try { Install-Update $release } catch { $failed=$true }
    if (!$failed -or (Get-Content (Join-Path $install 'De_words_helper.html') -Raw) -ne 'old' -or (Get-Content $configPath -Raw | ConvertFrom-Json).versionCode -ne 6) { throw 'Rollback failed' }
    Remove-Item -LiteralPath (Join-Path $install 'zzz.txt')
    Set-Asset (Archive @{'app-config.json'='{"versionCode":7,"versionName":"test.7"}';'De_words_helper.html'='new'})
    Install-Update $release
    if ((Get-Content $configPath -Raw | ConvertFrom-Json).versionCode -ne 7 -or (Get-Content (Join-Path $install 'user.txt') -Raw) -ne 'keep') { throw 'Installation failed' }
    # An old dialog cannot downgrade a directory already updated by another process.
    $script:cloudBytes=[byte[]]@(0)
    Install-Update $release
    Write-Output 'PASS: signature, channel, filename, checksum, ZIP paths, version, rollback, installation, retained files, stale update'
} finally { $rsa.Dispose();Remove-UpdateTemp $temporary }
