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

    def test_failed_preflight_never_uploads(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as directory:
            args = SimpleNamespace(directory=Path(directory), extra=[], installer=['x86_64=wrong.exe'], notes='test', upload_url='unused')
            with patch.object(publisher, 'verify_installer', side_effect=ValueError('wrong version')), patch.object(publisher, 'upload_files') as upload:
                with self.assertRaises(ValueError): publisher.publish_windows(args, self.config)
                upload.assert_not_called()


if __name__ == '__main__':
    unittest.main()
