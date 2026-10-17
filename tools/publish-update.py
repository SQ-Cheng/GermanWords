"""Package a test build, or sign and publish it to a Seafile upload link.

Requires cryptography for manifest signing only. No credentials are stored here.
"""
import argparse
import base64
import hashlib
import json
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
import uuid
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'shared/app-config.json'


def read_url(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def package(apk, destination, config):
    subprocess.run([sys.executable, str(ROOT / 'tools/build-windows.py')], check=True)
    destination.mkdir(parents=True, exist_ok=True)
    version = config['versionName']
    shutil.copyfile(apk, destination / f'GermanWords-Android-{version}.apk')
    with zipfile.ZipFile(destination / f'GermanWords-Windows-{version}.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        web = ROOT / 'output/windows/web'
        for file in sorted(web.rglob('*')):
            if file.is_file():
                relative = file.relative_to(web).as_posix()
                archive.write(file, 'De_words_helper.html' if relative == 'index.html' else relative)
        archive.write(CONFIG, 'app-config.json')
    print(f'Packaged {version} in {destination}')


def publish(args, config):
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    key = serialization.load_pem_private_key(args.key.read_bytes(), password=None)
    numbers = key.public_key().public_numbers()
    expected = config['publicKey']
    if numbers.n != int.from_bytes(base64.b64decode(expected['modulus']), 'big') or numbers.e != int.from_bytes(base64.b64decode(expected['exponent']), 'big'):
        raise ValueError('Signing key does not match the public key in app-config.json')
    release = dict(schema=1, channel=config['channel'], versionCode=config['versionCode'],
                   versionName=config['versionName'], notes=args.notes)
    files = list(args.extra)
    for platform, extension in [('android', 'apk'), ('windows', 'zip')]:
        file = args.directory / f"GermanWords-{platform.title()}-{config['versionName']}.{extension}"
        data = file.read_bytes()
        release[platform] = dict(file=file.name, size=len(data), sha256=hashlib.sha256(data).hexdigest())
        files.append(file)
    payload = json.dumps(release, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    signature = key.sign(payload, padding.PKCS1v15(), hashes.SHA256())
    manifest = args.directory / config['manifestPath'].lstrip('/')
    manifest.write_text(json.dumps(dict(payload=base64.b64encode(payload).decode(),
                                        signature=base64.b64encode(signature).decode())), encoding='utf-8')
    # Publish the signed manifest last: clients never see a release before its files exist.
    files.append(manifest)
    upload_files(files, manifest, args.upload_url, config)


def upload_files(files, manifest, upload_url, config):
    upload = urllib.parse.urlparse(upload_url)
    if upload.scheme != 'https' or upload.hostname != urllib.parse.urlparse(config['shareUrl']).hostname:
        raise ValueError('Use an HTTPS upload link on the configured cloud host')
    token = upload.path.rstrip('/').split('/')[-1]
    endpoint = f'https://{upload.netloc}/api/v2.1/upload-links/{token}/upload/'
    link = json.loads(read_url(endpoint))['upload_link']
    if urllib.parse.urlparse(link).hostname != upload.hostname or not link.startswith('https://'):
        raise ValueError('Unexpected upload server')
    share_token = urllib.parse.urlparse(config['shareUrl']).path.rstrip('/').split('/')[-1]
    listing = json.loads(read_url(f'https://{upload.netloc}/api/v2.1/share-links/{share_token}/dirents/?path=%2F'))
    existing_names = {entry['file_name'] for entry in listing['dirent_list'] if not entry['is_dir']}
    for file in files:
        data = file.read_bytes()
        url = config['shareUrl'] + 'files/?p=' + urllib.parse.quote('/' + file.name, safe='') + '&raw=1&t=' + uuid.uuid4().hex
        if file != manifest and file.name in existing_names:
            existing = read_url(url)
            if hashlib.sha256(existing).digest() != hashlib.sha256(data).digest():
                raise ValueError(f'Existing versioned package differs; increment the version: {file.name}')
            print(f'Already published and verified: {file.name}')
            continue
        boundary = uuid.uuid4().hex
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="parent_dir"\r\n\r\n/\r\n'
                f'--{boundary}\r\nContent-Disposition: form-data; name="replace"\r\n\r\n1\r\n'
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{file.name}"\r\n'
                'Content-Type: application/octet-stream\r\n\r\n').encode() + data + f'\r\n--{boundary}--\r\n'.encode()
        request = urllib.request.Request(link + '?ret-json=1', data=body,
                                         headers={'Content-Type': 'multipart/form-data; boundary=' + boundary})
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.load(response)
        if len(result) != 1 or result[0]['name'] != file.name:
            raise RuntimeError('The cloud renamed the uploaded file')
        if hashlib.sha256(read_url(url)).digest() != hashlib.sha256(data).digest():
            raise RuntimeError(f'Readback verification failed: {file.name}')
        print(f'Uploaded and verified: {file.name}')
        existing_names.add(file.name)


def publish_windows(args, config):
    args.directory.mkdir(parents=True, exist_ok=True)
    version = config['versionName']
    files = list(args.extra)
    platforms = {}
    for entry in args.installer:
        arch, source = entry.split('=', 1)
        if arch not in {'x86_64', 'aarch64'}:
            raise ValueError('Installer architecture must be x86_64 or aarch64')
        if 'windows-' + arch in platforms:
            raise ValueError('Duplicate installer architecture: ' + arch)
        installer = Path(source)
        signature = Path(source + '.sig').read_text(encoding='utf-8').strip()
        name = f'GermanWords-Windows-{version}-{arch}-Setup.exe'
        target = args.directory / name
        if target.resolve() != installer.resolve():
            shutil.copyfile(installer, target)
        url = config['shareUrl'] + 'files/?p=' + urllib.parse.quote('/' + name, safe='') + '&raw=1'
        platforms['windows-' + arch] = dict(url=url, signature=signature)
        files.append(target)
    manifest = args.directory / config['windowsUpdater']['manifestPath'].lstrip('/')
    manifest.write_text(json.dumps(dict(version=version, notes=args.notes, platforms=platforms), ensure_ascii=False, indent=2), encoding='utf-8')
    upload_files(files + [manifest], manifest, args.upload_url, config)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    pack = commands.add_parser('package')
    pack.add_argument('--apk', type=Path, required=True, help='Already signed APK matching app-config.json')
    pack.add_argument('--directory', type=Path, default=ROOT / 'output/releases/update-test')
    pub = commands.add_parser('publish')
    pub.add_argument('--directory', type=Path, default=ROOT / 'output/releases/update-test')
    pub.add_argument('--key', type=Path, required=True, help='Private RSA PEM, kept outside this repository')
    pub.add_argument('--upload-url', required=True, help='Private upload link; never commit it')
    pub.add_argument('--notes', required=True)
    pub.add_argument('--extra', type=Path, nargs='*', default=[], help='Optional seed packages to upload first')
    desktop = commands.add_parser('publish-windows', help='Publish Tauri installers; does not touch the legacy/Android feed')
    desktop.add_argument('--directory', type=Path, default=ROOT / 'output/releases/desktop-test')
    desktop.add_argument('--installer', action='append', required=True, help='x86_64=PATH or aarch64=PATH; include all released architectures')
    desktop.add_argument('--upload-url', required=True)
    desktop.add_argument('--notes', required=True)
    desktop.add_argument('--extra', type=Path, nargs='*', default=[])
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text(encoding='utf-8'))
    if args.command == 'package':
        package(args.apk, args.directory, config)
    elif args.command == 'publish':
        publish(args, config)
    else:
        publish_windows(args, config)


if __name__ == '__main__':
    main()
