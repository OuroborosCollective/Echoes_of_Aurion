"""Build a separate optional noVNC page; never modify a live file or service."""
import argparse
from pathlib import Path
import re
import shutil
import tempfile

# Verified noVNC 1.0.0 bootstrap bodies. This adapter itself requires modern
# module support, so their obsolete ES-module-loader fallback is unnecessary.
# Remove only these exact programs; never enable arbitrary inline execution.
LEGACY_INLINE = {
    ''.join('window._noVNC_has_module_support = true;'.split()),
    ''.join('''window.addEventListener("load", function() {
        if (window._noVNC_has_module_support) return;
        var loader = document.createElement("script");
        loader.src = "vendor/browser-es-module-loader/dist/browser-es-module-loader.js";
        document.head.appendChild(loader);
    });'''.split()),
}

def build(source, output, code):
    if output.exists():
        raise ValueError("OUTPUT_MUST_BE_ABSENT")
    html = (source / "vnc.html").read_text()
    scripts = list(re.finditer(r"<script\b[^>]*>.*?</script>", html, re.S | re.I))
    targets = [match for match in scripts if "app/ui.js" in match.group()]
    if len(targets) != 1:
        raise ValueError("NOVNC_INITIALIZER_NOT_UNIQUE")
    replacements = []
    for match in scripts:
        if match not in targets and not re.search(r"\bsrc\s*=", match.group(), re.I):
            body = re.sub(r'^<script\b[^>]*>|</script>$', '', match.group(), flags=re.I).strip()
            if ''.join(body.split()) not in LEGACY_INLINE:
                raise ValueError("UNEXPECTED_INLINE_SCRIPT")
            replacements.append((match.start(), match.end(), ''))
    match = targets[0]
    replacements.append((match.start(), match.end(), '<script type="module" src="app/aurion-login-ui.js"></script>'))
    for start, end, replacement in sorted(replacements, reverse=True):
        html = html[:start] + replacement + html[end:]
    policy = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
              "img-src 'self' data: blob:; connect-src 'self' wss://arelogic.space; "
              "object-src 'none'; base-uri 'none'; form-action 'self'")
    head = ('<meta name="referrer" content="no-referrer">\n'
            '<meta http-equiv="Content-Security-Policy" content="' + policy + '">\n')
    if html.count('<head>') != 1:
        raise ValueError("NOVNC_HEAD_NOT_UNIQUE")
    html = html.replace('<head>', '<head>\n' + head, 1)
    output.mkdir(parents=True)
    (output / 'aurion.html').write_text(html)
    (output / 'app').mkdir()
    for name in ('aurion-login-ui.js', 'aurion-login-core.js'):
        shutil.copyfile(code / name, output / 'app' / name)

def self_test():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        source = root / 'novnc'
        source.mkdir()
        source.joinpath('vnc.html').write_text('<head><script src="app/ui.js" type="module"></script></head>')
        build(source, root / 'modern', Path(__file__).parent)
        result = (root / 'modern/aurion.html').read_text()
        assert 'app/aurion-login-ui.js' in result and "connect-src 'self'" in result
        try:
            build(source, root / 'modern', Path(__file__).parent)
            raise AssertionError('existing output overwritten')
        except ValueError as error:
            assert str(error) == 'OUTPUT_MUST_BE_ABSENT'
        source.joinpath('vnc.html').write_text('<head><script>window._noVNC_has_module_support = true;</script><script src="app/ui.js"></script></head>')
        build(source, root / 'legacy', Path(__file__).parent)
        assert '_noVNC_has_module_support' not in (root / 'legacy/aurion.html').read_text()
        source.joinpath('vnc.html').write_text('<head><script>unexpected()</script><script src="app/ui.js"></script></head>')
        try:
            build(source, root / 'unexpected', Path(__file__).parent)
            raise AssertionError('unknown inline script accepted')
        except ValueError as error:
            assert str(error) == 'UNEXPECTED_INLINE_SCRIPT'
    print('PASS page generator: modern, known legacy, no overwrite, unknown inline rejected')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--novnc-source', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
    elif args.novnc_source is not None and args.output is not None:
        build(args.novnc_source, args.output, Path(__file__).parent)
    else:
        parser.error('supply --novnc-source and --output, or --self-test')
