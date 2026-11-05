"""Build a separate optional noVNC page; never modify a live file or service."""
import argparse
import hashlib
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

def deferred_ui(source):
    ui = (source / 'app/ui.js').read_text()
    if hashlib.sha256(ui.encode()).hexdigest() != '49dd68cd630ba75cca74602b8950ed84d14da39458819387c0ef76880d4c9172':
        raise ValueError('UNVERIFIED_NOVNC_UI')
    if hashlib.sha256((source / 'core/rfb.js').read_bytes()).hexdigest() != '708f8abd828b5b45c0cfdf101c51c39506a4210e2c5af5dd605493e67ac7c9cd':
        raise ValueError('UNVERIFIED_NOVNC_RFB')
    marker = '// Set up translations\n'
    if ui.count(marker) != 1 or ui.count('export default UI;') != 1:
        raise ValueError('UNEXPECTED_NOVNC_BOOTSTRAP')
    body, boot = ui.split(marker)
    boot = boot.removesuffix('export default UI;\n')
    return body + 'export function startUI() {\n' + boot + '\n}\nexport default UI;\n'

def build(source, output, code):
    if output.exists():
        raise ValueError("OUTPUT_MUST_BE_ABSENT")
    ui = deferred_ui(source)
    html = (source / "vnc.html").read_text()
    scripts = list(re.finditer(r"<script\b[^>]*>.*?</script>", html, re.S | re.I))
    targets = [match for match in scripts if "app/ui.js" in match.group()]
    if len(targets) != 1:
        raise ValueError("NOVNC_INITIALIZER_NOT_UNIQUE")
    replacements = []
    for match in scripts:
        opening_tag = match.group().split('>', 1)[0]
        if match not in targets and not re.search(r"\bsrc\s*=", opening_tag, re.I):
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
    (output / 'app/aurion-novnc-ui.js').write_text(ui)
    for name in ('aurion-login-ui.js', 'aurion-login-core.js'):
        shutil.copyfile(code / name, output / 'app' / name)

def self_test():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        source = root / 'novnc'
        source.mkdir()
        # Bootstrap semantics are separately tested against pinned upstream
        # noVNC in Chromium. Unit fixtures substitute only this file reader.
        global deferred_ui
        original_deferred = deferred_ui
        deferred_ui = lambda _: 'export default {};'
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
        loader = '''window.addEventListener("load", function() {
            if (window._noVNC_has_module_support) return;
            var loader = document.createElement("script");
            loader.src = "vendor/browser-es-module-loader/dist/browser-es-module-loader.js";
            document.head.appendChild(loader);
        });'''
        source.joinpath('vnc.html').write_text('<head><script>' + loader + '</script><script src="app/ui.js"></script></head>')
        build(source, root / 'legacy-loader', Path(__file__).parent)
        assert 'loader.src' not in (root / 'legacy-loader/aurion.html').read_text()
        source.joinpath('vnc.html').write_text('<head><script>loader.src = "unexpected";</script><script src="app/ui.js"></script></head>')
        try:
            build(source, root / 'unknown-loader', Path(__file__).parent)
            raise AssertionError('inline src expression treated as script attribute')
        except ValueError as error:
            assert str(error) == 'UNEXPECTED_INLINE_SCRIPT'
        source.joinpath('vnc.html').write_text('<head><script>unexpected()</script><script src="app/ui.js"></script></head>')
        try:
            build(source, root / 'unexpected', Path(__file__).parent)
            raise AssertionError('unknown inline script accepted')
        except ValueError as error:
            assert str(error) == 'UNEXPECTED_INLINE_SCRIPT'
        deferred_ui = original_deferred
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
