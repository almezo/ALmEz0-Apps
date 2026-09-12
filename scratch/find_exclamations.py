import os
import re

dir_path = "d:/My File/ALmEz0/1- Site"
exclude_dirs = ['node_modules', 'scratch', '.vscode', '.well-known', 'functions', 'photo', 'cgi-bin', '.firebase', '.git']

regex = re.compile(r'([\u0600-\u06FFa-zA-Z\s])!([\'"`<\s]|$)')

with open(os.path.join(dir_path, 'scratch', 'exclamations_output.txt'), 'w', encoding='utf-8') as out_f:
    for root, dirs, files in os.walk(dir_path):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            if file.endswith('.html') or file.endswith('.js'):
                filepath = os.path.join(root, file)
                with open(filepath, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    
                for i, line in enumerate(lines):
                    if '!' in line:
                        if '!=' in line or '!==' in line or '<!--' in line or '<!DOCTYPE' in line or '!important' in line:
                            # still check if there is a valid ! 
                            pass
                        
                        matches = regex.findall(line)
                        if matches:
                            out_f.write(f"File: {filepath}, Line: {i+1}\n")
                            out_f.write(f"  {line.strip()}\n")
