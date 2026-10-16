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
html = (root / 'apps/windows/De_words_helper.html').read_text(encoding='utf-8')
html = html.replace('src="../../shared/parser.js"', 'src="parser.js"')
(output / 'De_words_helper.html').write_text(html, encoding='utf-8', newline='\n')
shutil.copy2(root / 'shared/parser.js', output)
shutil.copytree(root / 'shared/words', output / 'words')
print(f'Built {output}')
