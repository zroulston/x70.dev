#!/usr/bin/env bash
# Re-download the self-hosted latin font subsets into fonts/ and regenerate
# css/fonts.css. Run from the repo root: ./scripts/fonts.sh
set -euo pipefail

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
SPEC="family=IBM+Plex+Mono:wght@400;500;600&family=Archivo:wght@400..700&display=swap"

mkdir -p fonts
curl -sf -A "$UA" "https://fonts.googleapis.com/css2?${SPEC}" -o /tmp/x70-gf.css

python3 - <<'PY'
import re, urllib.request, os
css = open('/tmp/x70-gf.css').read()
blocks = re.findall(r'/\* latin \*/\s*(@font-face \{.*?\})', css, re.S)
out = []
for b in blocks:
    fam = re.search(r"font-family: '([^']+)'", b).group(1)
    wgt = re.search(r'font-weight: ([^;]+);', b).group(1).strip()
    url = re.search(r'url\((https://[^)]+\.woff2)\)', b).group(1)
    name = f"{fam.lower().replace(' ','-')}-{wgt.replace(' ','')}.woff2"
    urllib.request.urlretrieve(url, f"fonts/{name}")
    print(f"  {name} ({os.path.getsize('fonts/'+name)//1024} KB)")
    out.append((fam, wgt, name, 'font-stretch' in b))
lines = ["/* Self-hosted latin subsets. Regenerate with `make fonts`. */\n"]
for fam, wgt, name, stretch in out:
    s = "\n  font-stretch: 100%;" if stretch else ""
    lines.append(f"""@font-face {{
  font-family: '{fam}';
  font-style: normal;
  font-weight: {wgt};{s}
  font-display: swap;
  src: url(../fonts/{name}) format('woff2');
}}""")
open('css/fonts.css','w').write("\n".join(lines) + "\n")
print("wrote css/fonts.css")
PY
