"""Prepare the same local frontend for Tauri and browser regression tests."""
import json
import zipfile

from frontend import ROOT as root, prepare

output, config, manifest = prepare('windows')
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
