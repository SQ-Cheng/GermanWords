param([switch]$CheckOnly, [switch]$ApplyUpdate, [switch]$NonInteractive, [switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$install = [IO.Path]::GetFullPath($PSScriptRoot)
$configPath = Join-Path $install 'app-config.json'
if (!(Test-Path -LiteralPath $configPath)) { $configPath = Join-Path $install '../../shared/app-config.json' }
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$hostName = ([Uri]$config.shareUrl).Host

function Read-CloudFile([string]$name, [int]$limit) {
    $url = [Uri]($config.shareUrl + 'files/?p=' + [Uri]::EscapeDataString($name) + '&raw=1&t=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
    for ($redirect = 0; $redirect -lt 6; $redirect++) {
        if ($url.Scheme -ne 'https' -or $url.Host -ne $hostName) { throw 'Untrusted download location.' }
        $request = [Net.HttpWebRequest]::Create($url)
        $request.Timeout = 10000; $request.ReadWriteTimeout = 10000; $request.AllowAutoRedirect = $false
        $request.UserAgent = 'GermanWords/' + $config.versionName
        $request.Headers['Cache-Control'] = 'no-cache'
        $response = $request.GetResponse()
        try {
            if ([int]$response.StatusCode -in @(301,302,303,307,308)) {
                $url = [Uri]::new($url, $response.Headers['Location']); continue
            }
            if ([int]$response.StatusCode -ne 200) { throw 'Download failed.' }
            $input = $response.GetResponseStream(); $output = [IO.MemoryStream]::new()
            try {
                $buffer = New-Object byte[] 16384
                while (($count = $input.Read($buffer,0,$buffer.Length)) -gt 0) {
                    if ($output.Length + $count -gt $limit) { throw 'Download exceeds size limit.' }
                    $output.Write($buffer,0,$count)
                }
                return ,$output.ToArray()
            } finally { $input.Dispose(); $output.Dispose() }
        } finally { $response.Dispose() }
    }
    throw 'Too many redirects.'
}

function Read-Update {
    $envelope = [Text.Encoding]::UTF8.GetString((Read-CloudFile $config.manifestPath 65536)) | ConvertFrom-Json
    $payload = [Convert]::FromBase64String($envelope.payload)
    $rsa = [Security.Cryptography.RSACryptoServiceProvider]::new()
    try {
        $key = New-Object Security.Cryptography.RSAParameters
        $key.Modulus = [Convert]::FromBase64String($config.publicKey.modulus)
        $key.Exponent = [Convert]::FromBase64String($config.publicKey.exponent)
        $rsa.ImportParameters($key)
        if (!$rsa.VerifyData($payload, 'SHA256', [Convert]::FromBase64String($envelope.signature))) { throw 'Invalid update signature.' }
    } finally { $rsa.Dispose() }
    $release = [Text.Encoding]::UTF8.GetString($payload) | ConvertFrom-Json
    if ($release.schema -ne 1 -or $release.channel -ne $config.channel -or $release.versionCode -isnot [int] -or $release.versionCode -le 0) { throw 'Invalid update information.' }
    $asset = $release.windows
    if ($asset.file -notmatch '^GermanWords-Windows-[a-zA-Z0-9.-]+\.zip$' -or $asset.sha256 -notmatch '^[a-f0-9]{64}$' -or $asset.size -le 0 -or $asset.size -gt 33554432) { throw 'Invalid Windows package information.' }
    return $release
}

function Remove-UpdateTemp([string]$path) {
    $resolved = [IO.Path]::GetFullPath($path)
    $parent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if (!$resolved.StartsWith($parent,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'GermanWords-update-*') { throw 'Invalid temporary directory.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}

function Install-Update($release) {
    $lock = [IO.File]::Open((Join-Path $install '.update.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    $temporary = Join-Path ([IO.Path]::GetTempPath()) ('GermanWords-update-' + [Guid]::NewGuid())
    $stage = Join-Path $temporary 'stage'; $backup = Join-Path $temporary 'backup'
    $written = [Collections.Generic.List[string]]::new(); $clean = $true
    try {
        $current = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($release.versionCode -le $current.versionCode) { return }
        New-Item -ItemType Directory -Path $stage,$backup | Out-Null
        $bytes = Read-CloudFile ('/' + $release.windows.file) ([int]$release.windows.size)
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $digest = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
        if ($bytes.Length -ne $release.windows.size -or $digest -ne $release.windows.sha256) { throw 'Package checksum mismatch.' }
        Add-Type -AssemblyName System.IO.Compression
        $stream = [IO.MemoryStream]::new($bytes, $false)
        $zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Read)
        try {
            $total = 0
            foreach ($entry in $zip.Entries) {
                $target = [IO.Path]::GetFullPath((Join-Path $stage $entry.FullName))
                if (!$target.StartsWith($stage + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or $entry.FullName.Contains(':')) { throw 'Unsafe archive path.' }
                $total += $entry.Length
                if ($total -gt 134217728) { throw 'Expanded package too large.' }
                if (!$entry.Name) { continue }
                [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
                $source = $entry.Open(); $output = [IO.File]::Create($target)
                try { $source.CopyTo($output) } finally { $source.Dispose(); $output.Dispose() }
            }
        } finally { $zip.Dispose(); $stream.Dispose() }
        $next = Get-Content -LiteralPath (Join-Path $stage 'app-config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($next.versionCode -ne $release.versionCode -or $next.versionName -ne $release.versionName -or !(Test-Path -LiteralPath (Join-Path $stage 'De_words_helper.html'))) { throw 'Package version mismatch.' }
        $files = Get-ChildItem -LiteralPath $stage -Recurse -File | Sort-Object @{Expression={$_.Name -eq 'app-config.json'}}
        foreach ($file in $files) {
            $relative = $file.FullName.Substring($stage.Length + 1)
            $target = Join-Path $install $relative; $saved = Join-Path $backup $relative
            if (Test-Path -LiteralPath $target) { [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($saved)) | Out-Null; [IO.File]::Copy($target,$saved,$true) }
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
            $written.Add($relative)
            [IO.File]::Copy($file.FullName,$target,$true)
        }
    } catch {
        $failure = $_
        foreach ($relative in $written) {
            try {
                $saved = Join-Path $backup $relative; $target = Join-Path $install $relative
                if (Test-Path -LiteralPath $saved) { [IO.File]::Copy($saved,$target,$true) } else { Remove-Item -LiteralPath $target -Force }
            } catch { $clean = $false }
        }
        if (!$clean) { throw "Update rollback needs attention. Backup: $backup" }
        throw $failure
    } finally { $lock.Dispose(); if ($clean -and (Test-Path -LiteralPath $temporary)) { Remove-UpdateTemp $temporary } }
}

try {
    if (!$CheckOnly -and !$NoLaunch) { Start-Process -FilePath (Join-Path $install 'De_words_helper.html') }
    $state = Join-Path $env:LOCALAPPDATA 'GermanWords/last-update-check.txt'
    if (!$CheckOnly -and !$ApplyUpdate) {
        if ((Test-Path -LiteralPath $state) -and ([DateTime]::UtcNow - (Get-Item -LiteralPath $state).LastWriteTimeUtc).TotalHours -lt 24) { exit 0 }
    }
    $release = Read-Update
    $available = $release.versionCode -gt $config.versionCode
    if ($CheckOnly) { @{current=$config.versionName;available=$available;version=$release.versionName} | ConvertTo-Json -Compress; exit 0 }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($state)) | Out-Null
    [IO.File]::WriteAllText($state,[DateTime]::UtcNow.ToString('o'))
    Add-Type -AssemblyName System.Windows.Forms
    if (!$available) { if ($ApplyUpdate -and !$NonInteractive) { [Windows.Forms.MessageBox]::Show('Already up to date.','GermanWords') | Out-Null }; exit 0 }
    if (!$NonInteractive -and [Windows.Forms.MessageBox]::Show(('Download and install ' + $release.versionName + "?`n" + $release.notes),'GermanWords','YesNo') -ne 'Yes') { exit 0 }
    Install-Update $release
    if (!$NonInteractive) { [Windows.Forms.MessageBox]::Show('Update complete. Refresh the study page.','GermanWords') | Out-Null }
    @{updated=$true;version=$release.versionName} | ConvertTo-Json -Compress
} catch {
    if ($CheckOnly -or $NonInteractive) { Write-Error $_; exit 1 }
    if ($ApplyUpdate) { Add-Type -AssemblyName System.Windows.Forms; [Windows.Forms.MessageBox]::Show(('Update failed: ' + $_.Exception.Message),'GermanWords') | Out-Null }
    exit 1
}
