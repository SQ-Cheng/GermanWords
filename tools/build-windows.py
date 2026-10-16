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
shutil.copy2(root / 'apps/windows/De_words_helper.html', output)
shutil.copytree(root / 'shared/words', output / 'words')
print(f'Built {output}')
