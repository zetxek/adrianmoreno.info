#!/usr/bin/env python3
"""Apply Kimi's FUNCTION-level patches onto a baseline file, with a hard guard.

Splices each `=== FUNCTION: name ===` block in by replacing that function in the
baseline. Any function NOT returned is preserved byte-for-byte. Refuses to write
when any required survivor disappears or the file shrinks.
"""
import re, sys, pathlib

def fn_span(src, name):
    """Byte span of `function name(...)  { ... }` (brace-matched, string-aware)."""
    m = re.search(r'(?m)^[ \t]*(?:export\s+)?(?:async\s+)?function\s+' + re.escape(name) + r'\s*\(', src)
    if not m:
        return None
    p = src.index('(', m.end() - 1)
    pd, k = 0, p
    while k < len(src):
        if src[k] == '(': pd += 1
        elif src[k] == ')':
            pd -= 1
            if pd == 0: break
        k += 1
    i = src.index('{', k)
    depth, j, n = 0, i, len(src)
    quote = None
    while j < n:
        c = src[j]
        if quote:
            if c == '\\': j += 2; continue
            if c == quote: quote = None
        elif c in '"\'`': quote = c
        elif c == '/' and j+1 < n and src[j+1] == '/':
            j = src.find('\n', j);  j = n if j < 0 else j;  continue
        elif c == '/' and j+1 < n and src[j+1] == '*':
            j = src.find('*/', j);  j = n if j < 0 else j+2;  continue
        elif c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return (m.start(), j+1)
        j += 1
    return None

def parse(patch_text):
    out = {}
    for m in re.finditer(r'^=== FUNCTION:\s*([A-Za-z0-9_$]+)\s*===\s*$', patch_text, re.M):
        name = m.group(1)
        end = patch_text.find('=== END FUNCTION ===', m.end())
        body = patch_text[m.end(): end if end != -1 else len(patch_text)]
        body = body.strip('\n')
        if body.strip():
            out[name] = body
    return out

target, patch_path, survivors = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
src = pathlib.Path(target).read_text()
before_lines, before_fns = src.count('\n'), len(re.findall(r'(?m)^[ \t]*(?:export\s+)?(?:async\s+)?function\s+\w+', src))
patch = parse(pathlib.Path(patch_path).read_text())
print(f"  patch declares {len(patch)} function(s): {', '.join(sorted(patch)) or '(none)'}")

applied, skipped = 0, []
for name, body in patch.items():
    span = fn_span(src, name)
    if span is None:
        skipped.append(name)
        continue
    src = src[:span[0]] + body + src[span[1]:]
    applied += 1
print(f"  applied {applied}; could not locate {len(skipped)}: {', '.join(skipped) or 'none'}")

missing = [s for s in survivors if not s.strip() or (re.search(r'(?m)^[ \t]*(?:export\s+)?(?:async\s+)?function\s+' + re.escape(s.strip()) + r'\s*\(', src) is None)]
after_lines, after_fns = src.count('\n'), len(re.findall(r'(?m)^[ \t]*(?:export\s+)?(?:async\s+)?function\s+\w+', src))
print(f"  lines {before_lines} -> {after_lines}   declarations {before_fns} -> {after_fns}")
if missing:
    print(f"  GUARD FAIL: missing {len(missing)} survivor(s): {', '.join(missing)}")
    sys.exit(2)
if after_lines < before_lines:
    print(f"  GUARD FAIL: file shrank by {before_lines-after_lines} lines")
    sys.exit(3)
if applied == 0:
    print("  GUARD FAIL: nothing applied")
    sys.exit(4)
pathlib.Path(target + '.spliced').write_text(src)
print(f"  GUARD PASS -> wrote {target}.spliced")
