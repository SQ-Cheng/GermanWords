"""Prepare the shared desktop UI; native and browser adapters stay separate."""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def prepare(platform):
    outputs = {'windows': ROOT / 'output/windows/web', 'browser': ROOT / 'output/web/GermanWords'}
    output = outputs[platform]
    if output.resolve() not in outputs.values():
        raise ValueError('Frontend output must remain in its build directory')
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    config = json.loads((ROOT / 'shared/app-config.json').read_text(encoding='utf-8'))
    client = ROOT / 'apps/web'
    html = (client / 'index.html').read_text(encoding='utf-8')
    html = html.replace('<title>德语单词</title>', '<title>德语单词 ' + config['versionName'] + '</title>')
    html = html.replace('<span id="appVersion"></span>', '<span id="appVersion"> · ' + config['versionName'] + '</span>')
    if platform == 'windows':
        native = ROOT / 'apps/windows/frontend'
        html = html.replace('<!-- platform-styles -->', '<link rel="stylesheet" href="../../shared/feedback.css">')
        html = html.replace('<!-- platform-ui -->', (native / 'update-dialog.html').read_text(encoding='utf-8'))
        html = html.replace('<script src="browser.js"></script>', '<script src="../../shared/feedback.js"></script><script src="desktop.js"></script>')
        shutil.copy2(native / 'desktop.js', output)
    else:
        html = html.replace('<!-- built-in library -->', '<script src="library-data.js"></script>')
        shutil.copy2(client / 'browser.js', output)
    for name in ['app.js', 'app.css', 'backup.js']:
        shutil.copy2(client / name, output)
    for source in sorted((ROOT / 'shared').iterdir()):
        reference = '../../shared/' + source.name
        if source.suffix in {'.js', '.css'} and reference in html:
            html = html.replace(reference, source.name)
            shutil.copy2(source, output)
    (output / 'index.html').write_text(html, encoding='utf-8', newline='\n')
    shutil.copytree(ROOT / 'shared/words', output / 'words')
    manifest = [dict(name=p.name, path=p.relative_to(output).as_posix())
                for p in sorted((output / 'words').rglob('*')) if p.is_file()]
    return output, config, manifest
