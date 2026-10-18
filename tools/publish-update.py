"""Validate, sign and publish dual-platform releases to a writable directory share.

Requires cryptography for manifest signing only. No credentials are stored here.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.parse
import urllib.request
import uuid
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'shared/app-config.json'


def sdk_tool(name):
    executable = name + ('.bat' if name == 'apksigner' else '.exe') if os.name == 'nt' else name
    found = shutil.which(executable)
    if found:
        return found
    sdk = os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
    if sdk:
        candidates = list((Path(sdk) / 'build-tools').glob('*/' + executable))
        stable = [p for p in candidates if re.fullmatch(r'\d+\.\d+\.\d+', p.parent.name)]
        if stable:
            return str(max(stable, key=lambda p: tuple(map(int, p.parent.name.split('.')))))
    raise ValueError(f'{name} is required; configure Android SDK build-tools')


def verify_apk(apk, config):
    if not 0 < apk.stat().st_size <= 33554432:
        raise ValueError('APK exceeds the Android 32 MiB limit or is empty')
    # Some Windows SDK tools cannot open a non-ASCII absolute path. Let the OS
    # select the working directory and pass only the package's filename.
    badging = subprocess.check_output([sdk_tool('aapt'), 'dump', 'badging', apk.name], cwd=apk.parent, encoding='utf-8')
    package = re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging)
    if not package or package.groups() != ('cn.study.germanwords', str(config['versionCode']), config['versionName']):
        raise ValueError('APK package/version does not match the release configuration')
    if 'application-debuggable' in badging:
        raise ValueError('Publish a Release APK; debug builds are not distributable')
    certs = subprocess.check_output([sdk_tool('apksigner'), 'verify', '--print-certs', apk.name], cwd=apk.parent, encoding='utf-8')
    expected = (ROOT / 'apps/android/release-certificate.sha256').read_text(encoding='utf-8').strip()
    signers = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]+)', certs)
    if [value.lower() for value in signers] != [expected]:
        raise ValueError('APK signing certificate does not match the supported upgrade identity')
    with zipfile.ZipFile(apk) as archive:
        embedded = json.loads(archive.read('assets/web/app-config.json'))
    if embedded != config:
        raise ValueError('APK embedded configuration differs from the release configuration')


def verify_installer(installer, arch, config):
    signature = Path(str(installer) + '.sig').read_text(encoding='utf-8').strip()
    decoded = base64.b64decode(signature, validate=True).decode('utf-8')
    public_key = base64.b64decode(config['windowsUpdater']['publicKey'], validate=True).decode('utf-8').splitlines()[1]
    minisign = os.environ.get('MINISIGN') or shutil.which('minisign')
    if not minisign:
        raise ValueError('Official minisign is required; add it to PATH or set MINISIGN')
    with tempfile.TemporaryDirectory(prefix='GermanWords-verify-') as directory:
        sig = Path(directory) / 'installer.minisig'
        sig.write_text(decoded, encoding='utf-8')
        subprocess.run([minisign, '-Vm', str(installer), '-x', str(sig), '-P', public_key, '-Q'], check=True)
    # Only trust this comment after minisign verified both the artifact and the comment.
    comment = next(line.removeprefix('trusted comment: ') for line in decoded.splitlines() if line.startswith('trusted comment: '))
    fields = dict(field.split(':', 1) for field in comment.split('\t') if ':' in field)
    suffix = {'x86_64':'_x64-setup.exe', 'aarch64':'_arm64-setup.exe'}[arch]
    if fields.get('version') != config['versionName'] or not fields.get('file', '').endswith(suffix):
        raise ValueError('Installer signed version/architecture does not match the release configuration')
    return signature


def read_url(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def prepare_release(args, config):
    """Validate every input before any remote write; produce one dual-platform index."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    version = config['versionName']
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?', version):
        raise ValueError('Invalid release version')
    verify_apk(args.apk, config)
    key = serialization.load_pem_private_key(args.key.read_bytes(), password=None)
    numbers = key.public_key().public_numbers()
    expected = config['publicKey']
    if numbers.n != int.from_bytes(base64.b64decode(expected['modulus']), 'big') or numbers.e != int.from_bytes(base64.b64decode(expected['exponent']), 'big'):
        raise ValueError('Signing key does not match app-config.json')
    installers = []
    for entry in args.installer:
        arch, source = entry.split('=', 1)
        if arch not in {'x86_64', 'aarch64'} or any(item[0] == arch for item in installers):
            raise ValueError('Invalid or duplicate installer architecture')
        file = Path(source)
        installers.append((arch, file, verify_installer(file, arch, config)))
    args.directory.mkdir(parents=True, exist_ok=True)
    files = []
    def stage(source, name):
        target = args.directory / name
        if source.resolve() != target.resolve():
            shutil.copyfile(source, target)
        files.append(target)
        return target
    apk = stage(args.apk, f'GermanWords-Android-{version}.apk')
    release = dict(schema=1, channel=config['channel'], versionCode=config['versionCode'],
                   versionName=version, notes=args.notes,
                   android=dict(file=f'{version}/{apk.name}', size=apk.stat().st_size,
                                sha256=hashlib.sha256(apk.read_bytes()).hexdigest()))
    platforms = {}
    for arch, source, signature in installers:
        file = stage(source, f'GermanWords-Windows-{version}-{arch}-Setup.exe')
        platforms['windows-' + arch] = dict(url=download_url(config, f'{version}/{file.name}'), signature=signature)
        stage(Path(str(source) + '.sig'), file.name + '.sig')
    for file in args.extra:
        if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._-]*', file.name) or file.name == Path(config['manifestPath']).name or any(f.name == file.name for f in files):
            raise ValueError('Unsafe or duplicate extra filename')
        stage(file, file.name)
    payload = json.dumps(release, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    signature = key.sign(payload, padding.PKCS1v15(), hashes.SHA256())
    manifest = args.directory / config['manifestPath'].lstrip('/')
    # Tauri reads version/platforms; Android verifies the RSA envelope in this same file.
    index = json.dumps(dict(version=version, notes=args.notes, platforms=platforms,
        payload=base64.b64encode(payload).decode(), signature=base64.b64encode(signature).decode()),
        ensure_ascii=False, indent=2).encode('utf-8')
    if len(index) > 65536:
        raise ValueError('Update index exceeds the Android 64 KiB limit; shorten the release notes')
    manifest.write_bytes(index)
    return files + [manifest], manifest


def download_url(config, path):
    return config['shareUrl'] + 'files/?p=' + urllib.parse.quote('/' + path, safe='') + '&raw=1'


def upload_files(files, manifest, upload_url, config):
    import ast
    upload = urllib.parse.urlparse(upload_url)
    host = urllib.parse.urlparse(config['shareUrl']).hostname
    if upload.scheme != 'https' or upload.hostname != host or not re.fullmatch(r'/d/[a-f0-9]+/', upload.path):
        raise ValueError('Use a writable HTTPS directory share on the configured host')
    # This is the same directory-upload API used by the service's own web client.
    page = read_url(upload_url).decode('utf-8')
    match = re.search(r"dirPath:\s*('(?:\\.|[^'])*')", page)
    if not match or not re.search(r'canUpload:\s*true', page):
        raise ValueError('The developer share does not allow uploads')
    parent = ast.literal_eval(match.group(1))
    if not parent.startswith('/') or '..' in parent.split('/'):
        raise ValueError('Invalid shared directory')
    token = upload.path.rstrip('/').split('/')[-1]
    link = json.loads(read_url(f'https://{upload.netloc}/api/v2.1/share-links/{token}/upload/?path=%2F'))['upload_link']
    target = urllib.parse.urlparse(link)
    if target.scheme != 'https' or target.hostname != host or target.port not in (None, 443):
        raise ValueError('Unexpected upload server')
    share_token = urllib.parse.urlparse(config['shareUrl']).path.rstrip('/').split('/')[-1]
    listing_url = f'https://{upload.netloc}/api/v2.1/share-links/{share_token}/dirents/?path='
    root = json.loads(read_url(listing_url + '%2F'))['dirent_list']
    version = config['versionName']
    version_exists = any(e['is_dir'] and e['file_name'] == version for e in root)
    existing = json.loads(read_url(listing_url + urllib.parse.quote('/' + version, safe='')))['dirent_list'] if version_exists else []
    existing_names = {e['file_name'] for e in existing if not e['is_dir']}
    for file in files:
        is_index = file == manifest
        path = file.name if is_index else f'{version}/{file.name}'
        data = file.read_bytes()
        url = download_url(config, path) + '&t=' + uuid.uuid4().hex
        if not is_index and file.name in existing_names:
            if hashlib.sha256(read_url(url)).digest() != hashlib.sha256(data).digest():
                raise ValueError(f'Existing package differs; increment the version: {path}')
            print(f'Already published and verified: {path}')
            continue
        boundary = uuid.uuid4().hex
        fields = dict(parent_dir=parent, replace='1' if is_index else '0')
        if not is_index:
            fields['relative_path'] = version + '/'
        body = b''.join((f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n').encode() for name, value in fields.items())
        body += (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n').encode() + data + f'\r\n--{boundary}--\r\n'.encode()
        request = urllib.request.Request(link + '?ret-json=1', data=body,
            headers={'Content-Type': 'multipart/form-data; boundary=' + boundary})
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.load(response)
        if len(result) != 1 or result[0]['name'] != file.name:
            raise RuntimeError('The service renamed the uploaded file')
        if hashlib.sha256(read_url(url)).digest() != hashlib.sha256(data).digest():
            raise RuntimeError(f'Readback verification failed: {path}')
        print(f'Uploaded and verified: {path}')
        existing_names.add(file.name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['publish'])
    parser.add_argument('--apk', type=Path, required=True)
    parser.add_argument('--installer', action='append', required=True, help='x86_64=PATH or aarch64=PATH; list all architectures')
    parser.add_argument('--directory', type=Path, default=ROOT / 'output/releases/prepared')
    parser.add_argument('--key', type=Path, required=True, help='Private RSA PEM outside this repository')
    parser.add_argument('--upload-url', default=os.environ.get('GERMANWORDS_RELEASE_UPLOAD_URL'))
    parser.add_argument('--notes', required=True)
    parser.add_argument('--extra', type=Path, nargs='*', default=[])
    parser.add_argument('--prepare-only', action='store_true', help='Validate and prepare locally without uploading')
    args = parser.parse_args()
    if not args.prepare_only and not args.upload_url:
        parser.error('--upload-url or GERMANWORDS_RELEASE_UPLOAD_URL is required')
    config = json.loads(CONFIG.read_text(encoding='utf-8'))
    files, manifest = prepare_release(args, config)
    if args.prepare_only:
        print(f'Prepared {manifest}; nothing uploaded')
    else:
        # The root index is always last, after all immutable packages were read back.
        upload_files(files, manifest, args.upload_url, config)


if __name__ == '__main__':
    main()
