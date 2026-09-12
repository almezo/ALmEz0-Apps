import os
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_LOGO = os.path.join(BASE_DIR, 'photo', 'logo-clean.png')
RES_DIR = os.path.join(BASE_DIR, 'android', 'app', 'src', 'main', 'res')

BG_COLOR = (10, 13, 18, 255) # #0a0d12

SPLASH_DIRS = {
    'drawable': (480, 800),
    'drawable-port-mdpi': (320, 480),
    'drawable-port-hdpi': (480, 800),
    'drawable-port-xhdpi': (720, 1280),
    'drawable-port-xxhdpi': (1080, 1920),
    'drawable-port-xxxhdpi': (1440, 2560),
    'drawable-land-mdpi': (480, 320),
    'drawable-land-hdpi': (800, 480),
    'drawable-land-xhdpi': (1280, 720),
    'drawable-land-xxhdpi': (1920, 1080),
    'drawable-land-xxxhdpi': (2560, 1440),
}

def generate_splash():
    logo = Image.open(SRC_LOGO).convert('RGBA')
    print(f"Loaded logo for splash: {SRC_LOGO}")

    for folder, (w, h) in SPLASH_DIRS.items():
        folder_path = os.path.join(RES_DIR, folder)
        os.makedirs(folder_path, exist_ok=True)

        splash_img = Image.new('RGBA', (w, h), BG_COLOR)

        # Scale logo to ~55% of the narrower dimension so it appears large and clear
        target_logo_sz = int(min(w, h) * 0.58)
        logo_resized = logo.resize((target_logo_sz, target_logo_sz), Image.Resampling.LANCZOS)

        offset = ((w - target_logo_sz) // 2, (h - target_logo_sz) // 2)
        splash_img.paste(logo_resized, offset, logo_resized)

        out_path = os.path.join(folder_path, 'splash.png')
        splash_img.save(out_path, 'PNG')
        print(f"Generated splash.png in {folder} ({w}x{h})")

    print("All native splash screens updated successfully!")

if __name__ == '__main__':
    generate_splash()
