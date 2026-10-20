"""Check the delivered ZIP, then extract it for browser tests (no source-tree fallback)."""
import base64
import json
import shutil
import unittest
from html.parser import HTMLParser
from urllib.parse import urlsplit
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTRACTED = ROOT / 'tmp/web-unpacked/Deutsch Wörter'


class PageAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'script' and values.get('src'):
            self.paths.append(values['src'])
        elif tag == 'link' and values.get('rel') == 'stylesheet':
            self.paths.append(values['href'])


class WebBundle(unittest.TestCase):
    def test_complete_offline_archive(self):
        version = json.loads((ROOT / 'shared/app-config.json').read_text(encoding='utf-8'))['versionName']
        with zipfile.ZipFile(ROOT / f'output/web/GermanWords-Web-{version}.zip') as bundle:
            names = bundle.namelist()
            self.assertEqual(len(names), len(set(names)))
            self.assertTrue(all(name.startswith('GermanWords/') and '..' not in Path(name).parts for name in names))
            html = bundle.read('GermanWords/index.html').decode('utf-8')
            assets = PageAssets()
            assets.feed(html)
            self.assertTrue(assets.paths)
            for reference in assets.paths:
                uri = urlsplit(reference)
                self.assertFalse(uri.scheme or uri.netloc or reference.startswith('/') or '..' in Path(uri.path).parts)
                self.assertIn('GermanWords/' + uri.path, names, 'Missing local script or stylesheet: ' + reference)
            for native_only in ['desktop.js', 'feedback.js', 'updateDialog', '../../shared/', '__TAURI__']:
                self.assertNotIn(native_only, html)
            self.assertFalse(any(Path(name).name in {'app-config.json', 'library.json', 'desktop.js', 'feedback.js'} for name in names))
            data = bundle.read('GermanWords/library-data.js').decode('utf-8')
            manifest = json.loads(data.removeprefix('const BuiltInLibrary = ').removesuffix(';\n'))
            expected = {p.relative_to(ROOT / 'shared').as_posix(): p for p in (ROOT / 'shared/words').rglob('*') if p.is_file()}
            self.assertEqual({item['path'] for item in manifest}, set(expected))
            books = [item for item in manifest if item['path'].lower().endswith('.xlsx')]
            self.assertEqual(len(books), 17)
            self.assertEqual(sum(item['path'].endswith('.mp3') for item in manifest), 459)
            for item in manifest:
                original = expected[item['path']].read_bytes()
                self.assertEqual(bundle.read('GermanWords/' + item['path']), original)
                if 'data' in item:
                    self.assertEqual(base64.b64decode(item['data'], validate=True), original)
            # Fixed, verified target within the repository's ignored tmp directory.
            self.assertTrue(EXTRACTED.resolve().is_relative_to((ROOT / 'tmp').resolve()))
            if EXTRACTED.exists():
                shutil.rmtree(EXTRACTED)
            bundle.extractall(EXTRACTED)


if __name__ == '__main__':
    unittest.main()
