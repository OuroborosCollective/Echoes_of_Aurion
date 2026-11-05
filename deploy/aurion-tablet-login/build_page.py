"""Build a separate optional noVNC page; never modify a live file or service."""
import argparse
from pathlib import Path
import re
import shutil

def build(source, output, code):
    if output.exists():
        raise ValueError("OUTPUT_MUST_BE_ABSENT")
    html = (source / "vnc.html").read_text()
    scripts = list(re.finditer(r"<script\b[^>]*>.*?</script>", html, re.S | re.I))
    targets = [match for match in scripts if "app/ui.js" in match.group()]
    if len(targets) != 1:
        raise ValueError("NOVNC_INITIALIZER_NOT_UNIQUE")
    for match in scripts:
        if match not in targets and not re.search(r"\bsrc\s*=", match.group(), re.I):
            raise ValueError("UNEXPECTED_INLINE_SCRIPT")
    match = targets[0]
    html = html[:match.start()] + '<script type="module" src="app/aurion-login-ui.js"></script>' + html[match.end():]
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

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--novnc-source', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    build(args.novnc_source, args.output, Path(__file__).parent)
