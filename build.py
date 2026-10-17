#!/usr/bin/env python3
"""Build reproducible Firefox, Chrome and source ZIPs without third-party tools."""
import argparse
from collections import OrderedDict
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent
FILES = (
    'manifest.json', 'data.js', 'background.js', 'queue.js', 'content.js',
    'popup.html', 'popup.css', 'popup.js', 'detail.js',
)
CHROME_FILES = ('chrome/compat.js', 'chrome/service-worker.js', 'chrome/downloads.js',
                'chrome/offscreen.html', 'chrome/offscreen.js')


def contents(browser='firefox', sources=False):
    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    assert manifest['manifest_version'] == 3
    assert manifest['browser_specific_settings']['gecko']['id'] == 'assyst-status-tagger@tjce.local'
    files = OrderedDict((name, (ROOT / name).read_bytes()) for name in FILES)
    if sources:
        names = list(CHROME_FILES) + ['build.py', 'README.md', 'CHROME.md', 'CONSTRUIR.md',
                                     'PUBLICAR.md', 'NOTAS-AMO.txt', 'REPRODUCAO.txt', 'VALIDACAO.md']
        names += [str(p.relative_to(ROOT)) for p in sorted((ROOT / 'tests').glob('*.cjs'))]
        for name in names:
            files[name] = (ROOT / name).read_bytes()
    elif browser == 'chrome':
        del manifest['browser_specific_settings']
        manifest['minimum_chrome_version'] = '116'
        manifest['background'] = {'service_worker': 'chrome/service-worker.js'}
        manifest['permissions'].append('offscreen')
        for script in manifest['content_scripts']:
            script['js'].insert(0, 'chrome/compat.js')
        files['manifest.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
        popup = files['popup.html'].decode('utf-8')
        anchor = '<script src="data.js"'
        assert popup.count(anchor) == 1, 'Cannot locate shared popup scripts'
        files['popup.html'] = popup.replace(anchor, '<script src="chrome/compat.js"></script>\n  ' + anchor, 1).encode('utf-8')
        for name in CHROME_FILES:
            files[name] = (ROOT / name).read_bytes()
    return files


def build(output, browser='firefox', sources=False):
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_STORED) as archive:
        for name, data in contents(browser, sources).items():
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            entry.compress_type = zipfile.ZIP_STORED
            archive.writestr(entry, data)
    return hashlib.sha256(output.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser', choices=['firefox', 'chrome'], default='firefox')
    parser.add_argument('--sources', action='store_true', help='Package shared sources and build instructions.')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--verify', type=Path, help='Compare the output byte for byte with the submitted ZIP.')
    args = parser.parse_args()
    version = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))['version']
    suffix = 'fontes' if args.sources else 'chrome' if args.browser == 'chrome' else 'submissao'
    output = args.output or ROOT / 'releases' / f'AssystNet-{version}-{suffix}.zip'
    digest = build(output, args.browser, args.sources)
    if args.verify and args.verify.read_bytes() != output.read_bytes():
        raise SystemExit('Verification failed: the submitted ZIP does not match the sources.')
    print(f'Created: {output}')
    print(f'SHA256: {digest}')
    if args.verify:
        print('Verification successful: the ZIP files are byte-for-byte identical.')


if __name__ == '__main__':
    main()
