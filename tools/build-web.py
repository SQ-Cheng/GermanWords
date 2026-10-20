"""Build an offline ZIP that opens directly without a local server."""
import base64
import json
import shutil
import zipfile
from frontend import ROOT, prepare

output, config, manifest = prepare('browser')
for item in manifest:
    if item['path'].endswith('.xlsx'):
        item['data'] = base64.b64encode((output / item['path']).read_bytes()).decode('ascii')
(output / 'library-data.js').write_text('const BrowserLibrary = ' + json.dumps(manifest, ensure_ascii=True, separators=(',', ':')) + ';\n', encoding='utf-8', newline='\n')
shutil.copy2(ROOT / 'apps/web/README.md', output / 'README.md')
archive = output.parent / ('GermanWords-Web-' + config['versionName'] + '.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
    for file in sorted(output.rglob('*')):
        if file.is_file():
            bundle.write(file, 'GermanWords/' + file.relative_to(output).as_posix())
print(f'Prepared {output} and {archive}')
