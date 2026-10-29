"""Release-input regression checks. Never uploads or installs packages."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import urllib.parse
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('publish_update', ROOT / 'tools/publish-update.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class ReleaseInputs(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((ROOT / 'shared/app-config.json').read_text(encoding='utf-8'))

    def test_apk_version_signature_and_embedded_config(self):
        certificate = (ROOT / 'apps/android/release-certificate.sha256').read_text().strip()
        valid = f"package: name='cn.study.germanwords' versionCode='{self.config['versionCode']}' versionName='{self.config['versionName']}'"
        with tempfile.TemporaryDirectory() as directory:
            apk = Path(directory) / 'app.apk'
            with zipfile.ZipFile(apk, 'w') as archive:
                archive.writestr('assets/web/app-config.json', json.dumps(self.config))
            for info, cert, expected_error in [
                (valid, certificate, None),
                (valid.replace("versionCode='", "versionCode='0"), certificate, ValueError),
                (valid.replace('cn.study.germanwords', 'other.app'), certificate, ValueError),
                (valid, '0' * 64, ValueError),
                (valid + '\napplication-debuggable', certificate, ValueError),
            ]:
                with self.subTest(info=info, certificate=cert):
                    with patch.object(publisher, 'sdk_tool', side_effect=lambda name:name), patch.object(publisher.subprocess, 'check_output', side_effect=[info, 'Signer #1 certificate SHA-256 digest: ' + cert]):
                        if expected_error:
                            with self.assertRaises(expected_error): publisher.verify_apk(apk, self.config)
                        else:
                            publisher.verify_apk(apk, self.config)
            with zipfile.ZipFile(apk, 'w') as archive:
                archive.writestr('assets/web/app-config.json', '{}')
            with patch.object(publisher, 'sdk_tool', side_effect=lambda name:name), patch.object(publisher.subprocess, 'check_output', side_effect=[valid, 'Signer #1 certificate SHA-256 digest: ' + certificate]):
                with self.assertRaises(ValueError): publisher.verify_apk(apk, self.config)

    def test_windows_signed_version_architecture_and_tampering(self):
        minisign = os.environ.get('MINISIGN') or shutil.which('minisign')
        if not minisign:
            self.skipTest('Install official minisign for signature integration tests')
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            public, secret = directory / 'test.pub', directory / 'test.key'
            subprocess.run([minisign, '-G', '-W', '-p', str(public), '-s', str(secret)], check=True, capture_output=True)
            config = dict(self.config, windowsUpdater=dict(self.config['windowsUpdater'], publicKey=base64.b64encode(public.read_bytes()).decode()))
            installer = directory / 'test.exe'
            installer.write_bytes(b'package fixture')
            comment = f"file:GermanWords_test_x64-setup.exe\tversion:{config['versionName']}"
            raw_sig = directory / 'test.minisig'
            subprocess.run([minisign, '-Sm', str(installer), '-s', str(secret), '-x', str(raw_sig), '-t', comment], check=True, capture_output=True)
            Path(str(installer) + '.sig').write_text(base64.b64encode(raw_sig.read_bytes()).decode())
            with patch.dict(os.environ, {'MINISIGN':minisign}):
                publisher.verify_installer(installer, 'x86_64', config)
                for arch, changed in [('aarch64',config), ('x86_64',dict(config, versionName='99.0.0'))]:
                    with self.assertRaises(ValueError): publisher.verify_installer(installer, arch, changed)
                installer.write_bytes(b'tampered')
                with self.assertRaises(subprocess.CalledProcessError): publisher.verify_installer(installer, 'x86_64', config)

    def test_combined_index_binds_android_path_and_windows_signatures(self):
        from types import SimpleNamespace
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa, padding
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        number = key.public_key().public_numbers()
        config = dict(self.config, publicKey=dict(modulus=base64.b64encode(number.n.to_bytes(256, 'big')).decode(), exponent='AQAB'))
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            apk, installer, secret = folder/'app.apk', folder/'app.exe', folder/'key.pem'
            apk.write_bytes(b'apk'); installer.write_bytes(b'installer'); Path(str(installer)+'.sig').write_text('signed')
            secret.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
            args = SimpleNamespace(apk=apk, key=secret, directory=folder/'staged', extra=[], installer=['x86_64='+str(installer)], notes='test')
            with patch.object(publisher, 'verify_apk'), patch.object(publisher, 'verify_installer', return_value='signed'):
                files, indexes = publisher.prepare_release(args, config)
            self.assertEqual(len(indexes), 1)
            index = indexes[0]
            self.assertEqual(files[-1], index)
            envelope = json.loads(index.read_text(encoding='utf-8'))
            payload = base64.b64decode(envelope['payload'])
            key.public_key().verify(base64.b64decode(envelope['signature']), payload, padding.PKCS1v15(), hashes.SHA256())
            release = json.loads(payload)
            self.assertEqual(release['android']['file'], config['versionName']+'/GermanWords-Android-'+config['versionName']+'.apk')
            self.assertEqual(envelope['platforms']['windows-x86_64']['signature'], 'signed')
            self.assertIn(urllib.parse.quote('/'+config['versionName']+'/', safe=''), envelope['platforms']['windows-x86_64']['url'])
            self.assertEqual(envelope['version'], release['versionName'])
            config.update(channel='stable', versionName='4.2.1')
            with patch.object(publisher, 'verify_apk'), patch.object(publisher, 'verify_installer', return_value='signed'):
                files, indexes = publisher.prepare_release(args, config)
            self.assertEqual([index.name for index in indexes], ['update-stable.json', 'update-beta.json'])
            for index, channel in zip(indexes, ['stable', 'beta']):
                envelope = json.loads(index.read_text(encoding='utf-8'))
                payload = base64.b64decode(envelope['payload'])
                key.public_key().verify(base64.b64decode(envelope['signature']), payload, padding.PKCS1v15(), hashes.SHA256())
                self.assertEqual(json.loads(payload)['channel'], channel)
                self.assertEqual(json.loads(payload)['versionName'], '4.2.1')
                self.assertEqual(envelope['channel'], channel)
            args.notes = 'long notes' * 10000
            with patch.object(publisher, 'verify_apk'), patch.object(publisher, 'verify_installer', return_value='signed'):
                with self.assertRaisesRegex(ValueError, '64 KiB'): publisher.prepare_release(args, config)
            args.notes = 'test'
            with patch.object(publisher, 'verify_apk', side_effect=ValueError('wrong APK')), patch.object(publisher, 'upload_files') as upload:
                with self.assertRaises(ValueError): publisher.prepare_release(args, config)
                upload.assert_not_called()

    def test_version_directory_uploads_before_root_index(self):
        import io
        version = self.config['versionName']
        with tempfile.TemporaryDirectory() as directory:
            apk = Path(directory)/'package.apk'; apk.write_bytes(b'apk')
            index = Path(directory)/'update-beta.json'; index.write_bytes(b'index')
            sent = []
            def read(url):
                if '/d/write/' in url: return b"dirPath: '/Release/', canUpload: true"
                if '/upload/?' in url: return b'{"upload_link":"https://cloud.tsinghua.edu.cn/upload/temporary"}'
                if '/dirents/' in url: return b'{"dirent_list":[]}'
                return b'index' if 'update-beta.json' in url else b'apk'
            def post(request, **kwargs):
                sent.append(request.data)
                name = 'update-beta.json' if b'filename="update-beta.json"' in request.data else 'package.apk'
                return io.BytesIO(json.dumps([dict(name=name)]).encode())
            # A hexadecimal token has the same shape as a real writable share.
            with patch.object(publisher, 'read_url', side_effect=lambda url: read(url.replace('/d/abcdef/', '/d/write/'))), patch.object(publisher.urllib.request, 'urlopen', side_effect=post):
                publisher.upload_files([apk,index],[index],'https://cloud.tsinghua.edu.cn/d/abcdef/',self.config)
            self.assertIn(('\r\n'+version+'/\r\n').encode(), sent[0])
            self.assertIn(b'name="parent_dir"\r\n\r\n/Release/', sent[0])
            self.assertNotIn(b'name="relative_path"',sent[-1])
            self.assertIn(b'name="replace"\r\n\r\n1',sent[-1])

    def test_existing_version_cannot_be_overwritten_with_different_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory)/'package.apk'; package.write_bytes(b'new')
            index = Path(directory)/'update-beta.json'
            def read(url):
                if '/d/abcdef/' in url: return b"dirPath: '/Release/', canUpload: true"
                if '/upload/?' in url: return b'{"upload_link":"https://cloud.tsinghua.edu.cn/upload/temporary"}'
                if '/dirents/?path=%2F' in url and self.config['versionName'] not in url:
                    return json.dumps(dict(dirent_list=[dict(is_dir=True,folder_name=self.config['versionName'])])).encode()
                if '/dirents/' in url: return b'{"dirent_list":[{"is_dir":false,"file_name":"package.apk"}]}'
                return b'old'
            with patch.object(publisher,'read_url',side_effect=read), patch.object(publisher.urllib.request,'urlopen') as post:
                with self.assertRaises(ValueError): publisher.upload_files([package,index],[index],'https://cloud.tsinghua.edu.cn/d/abcdef/',self.config)
                post.assert_not_called()

    def test_existing_release_reuses_files_and_only_refreshes_index(self):
        import io
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory)/'package.apk'; package.write_bytes(b'apk')
            index = Path(directory)/'update-beta.json'
            metadata = dict(version=self.config['versionName'], payload=base64.b64encode(json.dumps(dict(versionName=self.config['versionName'],versionCode=self.config['versionCode'])).encode()).decode())
            data = json.dumps(metadata).encode()
            index.write_bytes(data)
            def read(url):
                if '/d/abcdef/' in url: return b"dirPath: '/Release/', canUpload: true"
                if '/upload/?' in url: return b'{"upload_link":"https://cloud.tsinghua.edu.cn/upload/temporary"}'
                if '/dirents/' in url and self.config['versionName'] not in url:
                    return json.dumps(dict(dirent_list=[dict(is_dir=True,folder_name='older-version'),
                        dict(is_dir=True,folder_name=self.config['versionName']),dict(is_dir=False,file_name=index.name)])).encode()
                if '/dirents/' in url: return b'{"dirent_list":[{"is_dir":false,"file_name":"package.apk"}]}'
                return data if 'update-beta.json' in url else b'apk'
            with patch.object(publisher,'read_url',side_effect=read), patch.object(publisher.urllib.request,'urlopen',return_value=io.BytesIO(b'[{"name":"update-beta.json"}]')) as post:
                publisher.upload_files([package,index],[index],'https://cloud.tsinghua.edu.cn/d/abcdef/',self.config)
                self.assertEqual(post.call_count,1)
                self.assertIn(b'filename="update-beta.json"',post.call_args.args[0].data)

    def test_channel_publication_never_regresses_an_entry_point(self):
        stable, beta = Path('update-stable.json'), Path('update-beta.json')
        config = dict(self.config, channel='stable', versionName='4.2.1', versionCode=20)
        def index(version, code):
            return json.dumps(dict(version=version,payload=base64.b64encode(json.dumps(dict(versionName=version,versionCode=code)).encode()).decode())).encode()
        for version, code, expected in [('4.2.1-beta.4',19,[stable,beta]), ('4.3.0-beta.1',19,[stable]), ('4.2.1',20,[stable,beta])]:
            selected = publisher.select_manifests([stable,beta],{beta.name:index(version,code)},config)
            self.assertEqual(selected,expected)
        for version, code in [('4.3.0',21), ('4.2.0',21), ('4.2.0',20)]:
            with self.assertRaises(ValueError):
                publisher.select_manifests([stable,beta],{stable.name:index(version,code)},config)
        with self.assertRaises(ValueError):
            publisher.select_manifests([stable,beta],{beta.name:index('4.3.0-beta.1',21)},config)
        with self.assertRaises(ValueError):
            publisher.select_manifests([beta],{beta.name:index('4.2.1',20)},dict(config,channel='beta',versionName='4.2.1-beta.5',versionCode=21))
        # A newer beta can remain in the beta entry while a stable release consumes a higher code.
        published = {stable.name:index('4.2.1',21), beta.name:index('4.3.0-beta.1',20)}
        for code in [20,21]:
            with self.assertRaises(ValueError):
                publisher.select_manifests([beta],published,dict(config,channel='beta',versionName='4.3.0-beta.2',versionCode=code))
        self.assertEqual(publisher.select_manifests([beta],published,dict(config,channel='beta',versionName='4.3.0-beta.2',versionCode=22)),[beta])
        self.assertLess(publisher.version_key('4.2.1-beta.9'),publisher.version_key('4.2.1-beta.10'))
        self.assertLess(publisher.version_key('4.2.1-beta.10'),publisher.version_key('4.2.1'))
        for invalid in ['4.2', '4.2.1-beta', '4.2.1-beta.01', '4.2.01']:
            with self.assertRaises(ValueError): publisher.version_key(invalid)

    def test_stable_upload_finishes_packages_before_both_indexes(self):
        import io
        config = dict(self.config, channel='stable', versionName='4.2.1')
        with tempfile.TemporaryDirectory() as directory:
            package, stable, beta = (Path(directory)/name for name in ['package.apk','update-stable.json','update-beta.json'])
            package.write_bytes(b'apk');stable.write_bytes(b'stable');beta.write_bytes(b'beta')
            uploaded = []
            def read(url):
                if '/d/abcdef/' in url:return b"dirPath: '/Release/', canUpload: true"
                if '/upload/?' in url:return b'{"upload_link":"https://cloud.tsinghua.edu.cn/upload/temporary"}'
                if '/dirents/' in url:return b'{"dirent_list":[]}'
                return b'stable' if 'update-stable.json' in url else b'beta' if 'update-beta.json' in url else b'apk'
            def post(request, **kwargs):
                name = 'update-stable.json' if b'filename="update-stable.json"' in request.data else 'update-beta.json' if b'filename="update-beta.json"' in request.data else 'package.apk'
                uploaded.append(name)
                return io.BytesIO(json.dumps([dict(name=name)]).encode())
            with patch.object(publisher,'read_url',side_effect=read), patch.object(publisher.urllib.request,'urlopen',side_effect=post):
                publisher.upload_files([stable,package,beta],[stable,beta],'https://cloud.tsinghua.edu.cn/d/abcdef/',config)
            self.assertEqual(uploaded,['package.apk','update-stable.json','update-beta.json'])
            uploaded.clear()
            def broken_read(url):
                if 'package.apk' in url:return b'bad readback'
                return read(url)
            with patch.object(publisher,'read_url',side_effect=broken_read), patch.object(publisher.urllib.request,'urlopen',side_effect=post):
                with self.assertRaises(RuntimeError):
                    publisher.upload_files([package,stable,beta],[stable,beta],'https://cloud.tsinghua.edu.cn/d/abcdef/',config)
            self.assertEqual(uploaded,['package.apk'],'failed package readback never commits an index')

    def test_beta_upload_checks_the_stable_version_code_before_writing(self):
        config = dict(self.config, channel='beta', versionName='4.3.0-beta.2', versionCode=21)
        def index(version, code):
            return json.dumps(dict(version=version,payload=base64.b64encode(json.dumps(dict(versionName=version,versionCode=code)).encode()).decode())).encode()
        published = {'update-stable.json':index('4.2.1',21),'update-beta.json':index('4.3.0-beta.1',20)}
        def read(url):
            if '/d/abcdef/' in url:return b"dirPath: '/Release/', canUpload: true"
            if '/upload/?' in url:return b'{"upload_link":"https://cloud.tsinghua.edu.cn/upload/temporary"}'
            if '/dirents/' in url:return json.dumps(dict(dirent_list=[dict(is_dir=False,file_name=name) for name in published])).encode()
            return next(data for name,data in published.items() if name in url)
        with tempfile.TemporaryDirectory() as directory:
            package, manifest = Path(directory)/'package.apk', Path(directory)/'update-beta.json'
            package.write_bytes(b'apk');manifest.write_bytes(b'index')
            with patch.object(publisher,'read_url',side_effect=read), patch.object(publisher.urllib.request,'urlopen') as post:
                with self.assertRaisesRegex(ValueError,'versionCode'):
                    publisher.upload_files([package,manifest],[manifest],'https://cloud.tsinghua.edu.cn/d/abcdef/',config)
                post.assert_not_called()

    def test_build_channel_and_version_must_match_before_signing(self):
        for version, channel in [('4.2.1-beta.5','stable'), ('4.2.1','beta'), ('4.2.1','unknown')]:
            with patch.object(publisher,'verify_apk') as verify:
                with self.assertRaises(ValueError):
                    publisher.prepare_release(None,dict(self.config,versionName=version,channel=channel))
                verify.assert_not_called()

    def test_sdk_receives_filename_and_working_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory) / '中文路径'; folder.mkdir()
            apk = folder / 'test.apk'; apk.write_bytes(b'fixture')
            with patch.object(publisher, 'sdk_tool', return_value='aapt'), patch.object(publisher.subprocess, 'check_output', return_value='invalid package') as run:
                with self.assertRaises(ValueError): publisher.verify_apk(apk, self.config)
                self.assertEqual(run.call_args.args[0][-1], apk.name)
                self.assertEqual(run.call_args.kwargs['cwd'], apk.parent)

    def test_apk_size_matches_client_limit_before_running_sdk(self):
        with tempfile.TemporaryDirectory() as directory:
            apk = Path(directory) / 'test.apk'
            for size in [0, 33554433]:
                with apk.open('wb') as file: file.truncate(size)
                with patch.object(publisher, 'sdk_tool') as sdk:
                    with self.assertRaisesRegex(ValueError, '32 MiB'): publisher.verify_apk(apk, self.config)
                    sdk.assert_not_called()


if __name__ == '__main__':
    unittest.main()
