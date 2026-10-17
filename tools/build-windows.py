"""Build the offline Windows folder from the client and shared resources."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
output = root / 'output/windows'
if output.resolve() != root / 'output/windows':
    raise ValueError('Windows output must stay inside the repository')
if output.exists():
    shutil.rmtree(output)
output.mkdir(parents=True)
client = root / 'apps/windows'
html = (client / 'De_words_helper.html').read_text(encoding='utf-8')
for source in client.iterdir():
    if source.suffix in {'.js', '.css'}:
        shutil.copy2(source, output)
for source in sorted((root / 'shared').iterdir()):
    if source.suffix not in {'.js', '.css'}:
        continue
    html = html.replace('../../shared/' + source.name, source.name)
    shutil.copy2(source, output)
(output / 'De_words_helper.html').write_text(html, encoding='utf-8', newline='\n')
shutil.copytree(root / 'shared/words', output / 'words')
print(f'Built {output}')
