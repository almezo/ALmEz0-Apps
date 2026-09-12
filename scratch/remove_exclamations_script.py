import os
import re

dir_path = "d:/My File/ALmEz0/1- Site"
exclude_dirs = ['node_modules', 'scratch', '.vscode', '.well-known', 'functions', 'photo', 'cgi-bin', '.firebase', '.git']

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Replace ! followed by quote
    # Example: "مرحبا!" -> "مرحبا"
    content = re.sub(r'!(?=["\'`])', '', content)
    
    # 2. Replace ! preceded by Arabic character (with optional space)
    content = re.sub(r'([\u0600-\u06FF]\s*)!', r'\1', content)
    
    # 3. Replace ! followed by < (in HTML)
    # wait, <!DOCTYPE and <!-- are HTML tags!
    # So we should only replace ! before < if it's NOT part of <!... wait, the exclamation mark is BEFORE <. Like "مرحبا!<br>"
    content = re.sub(r'!(?=<)', '', content)
    
    # 4. Replace ! followed by space, if preceded by Arabic or English letters
    # Example: "Hello! " -> "Hello "
    content = re.sub(r'([a-zA-Z\u0600-\u06FF])!(\s)', r'\1\2', content)

    # 5. Remove ! at the very end of a string or line
    content = re.sub(r'([a-zA-Z\u0600-\u06FF])!$', r'\1', content, flags=re.MULTILINE)
    
    # What about emojis followed by ! ?
    # Let's replace "👋!" with "👋", "🔒!" with "🔒", etc.
    # We can just look for ! followed by quote, which we already did in #1.
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

for root, dirs, files in os.walk(dir_path):
    dirs[:] = [d for d in dirs if d not in exclude_dirs]
    for file in files:
        if file.endswith('.html') or file.endswith('.js'):
            filepath = os.path.join(root, file)
            process_file(filepath)
            
print("Done processing files.")
