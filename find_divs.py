import re

with open('d:/My File/ALmEz0/1- Site - Copy/player.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

depth = 0
for i, line in enumerate(lines):
    opens = line.count('<div')
    closes = line.count('</div')
    depth += opens
    depth -= closes
    if depth < 0:
        print(f"Negative depth at line {i+1}: {line.strip()}")
        depth = 0 # reset to continue finding others
