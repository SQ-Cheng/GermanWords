"""Prepare the same local frontend for Tauri and browser regression tests."""
import json
import shutil
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
output = root / 'output/windows/web'
if output.resolve() != root / 'output/windows/web':
    raise ValueError('Windows output must stay inside the repository')
if output.exists():
    shutil.rmtree(output)
output.mkdir(parents=True)
client = root / 'apps/windows/frontend'
config = json.loads((root / 'shared/app-config.json').read_text(encoding='utf-8'))
html = (client / 'index.html').read_text(encoding='utf-8')
html = html.replace('<title>德语单词</title>', '<title>德语单词 ' + config['versionName'] + '</title>')
html = html.replace('<span id="appVersion"></span>', '<span id="appVersion"> · ' + config['versionName'] + '</span>')
for source in client.iterdir():
    if source.suffix in {'.js', '.css'}:
        shutil.copy2(source, output)
for source in sorted((root / 'shared').iterdir()):
    if source.suffix not in {'.js', '.css'}:
        continue
    html = html.replace('../../../shared/' + source.name, source.name)
    shutil.copy2(source, output)
(output / 'index.html').write_text(html, encoding='utf-8', newline='\n')
shutil.copytree(root / 'shared/words', output / 'words')
manifest = [dict(name=p.name, path=p.relative_to(output).as_posix())
            for p in sorted((output / 'words').rglob('*')) if p.is_file()]
(output / 'library.json').write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
# Existing file:// installations need the same HTML filename to export browser data.
# Their old launcher/updater files stay in place when this compatibility ZIP is applied.
with zipfile.ZipFile(output.parent / 'GermanWords-Legacy-Migration.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(output.iterdir()):
        if file.suffix in {'.html', '.js', '.css'}:
            archive.write(file, 'De_words_helper.html' if file.name == 'index.html' else file.name)
    archive.write(root / 'shared/app-config.json', 'app-config.json')
    archive.writestr('MIGRATION.txt', 'Extract into your existing Windows HTML folder, replacing application files.\nOpen De_words_helper.html at its ORIGINAL path in the ORIGINAL browser.\nExport stars/settings, then import the JSON into the desktop app.\nYour words folder is not included or changed.\n')
generated = dict(version=config['versionName'], plugins=dict(updater=dict(pubkey=config['windowsUpdater']['publicKey'])))
(root / 'apps/windows/src-tauri/tauri.generated.json').write_text(json.dumps(generated, indent=2), encoding='utf-8')
print(f'Prepared {output}')
