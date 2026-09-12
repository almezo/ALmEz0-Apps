import os
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_LOGO_RAW = os.path.join(BASE_DIR, 'photo', 'logo-512.png')
SRC_LOGO_CLEAN = os.path.join(BASE_DIR, 'photo', 'logo-clean.png')
RES_DIR = os.path.join(BASE_DIR, 'android', 'app', 'src', 'main', 'res')

BG_COLOR = (10, 13, 18, 255) # #0a0d12

DENSITIES = {
    'mipmap-mdpi': {'legacy': 48, 'foreground': 108},
    'mipmap-hdpi': {'legacy': 72, 'foreground': 162},
    'mipmap-xhdpi': {'legacy': 96, 'foreground': 216},
    'mipmap-xxhdpi': {'legacy': 144, 'foreground': 324},
    'mipmap-xxxhdpi': {'legacy': 192, 'foreground': 432},
}

def prepare_clean_logo():
    # Crop out the outer green border completely (crop 52, 52, 460, 460)
    raw = Image.open(SRC_LOGO_RAW).convert('RGBA')
    clean = raw.crop((52, 52, 460, 460)).resize((512, 512), Image.Resampling.LANCZOS)
    clean.save(SRC_LOGO_CLEAN)
    print(f"Prepared clean borderless logo at {SRC_LOGO_CLEAN}")
    return clean

def generate_icons():
    logo = prepare_clean_logo()

    for folder, sizes in DENSITIES.items():
        folder_path = os.path.join(RES_DIR, folder)
        os.makedirs(folder_path, exist_ok=True)

        leg_size = sizes['legacy']
        fg_size = sizes['foreground']

        # 1. Legacy Squircle/Square Launcher (ic_launcher.png)
        # Scaled to 0.70 of canvas so it has comfortable margins matching the top PWA icon
        canvas_leg = Image.new('RGBA', (leg_size, leg_size), BG_COLOR)
        logo_leg_sz = int(leg_size * 0.70)
        logo_leg_resized = logo.resize((logo_leg_sz, logo_leg_sz), Image.Resampling.LANCZOS)
        offset_leg = ((leg_size - logo_leg_sz) // 2, (leg_size - logo_leg_sz) // 2)
        canvas_leg.paste(logo_leg_resized, offset_leg, logo_leg_resized)
        canvas_leg.save(os.path.join(folder_path, 'ic_launcher.png'), 'PNG')

        # 2. Legacy Round Launcher (ic_launcher_round.png)
        canvas_round = Image.new('RGBA', (leg_size, leg_size), (0, 0, 0, 0))
        from PIL import ImageDraw
        mask = Image.new('L', (leg_size, leg_size), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0, leg_size - 1, leg_size - 1), fill=255)

        bg_circle = Image.new('RGBA', (leg_size, leg_size), BG_COLOR)
        canvas_round.paste(bg_circle, (0, 0), mask)

        logo_round_sz = int(leg_size * 0.58)
        logo_round_resized = logo.resize((logo_round_sz, logo_round_sz), Image.Resampling.LANCZOS)
        offset_round = ((leg_size - logo_round_sz) // 2, (leg_size - logo_round_sz) // 2)
        canvas_round.paste(logo_round_resized, offset_round, logo_round_resized)
        canvas_round.save(os.path.join(folder_path, 'ic_launcher_round.png'), 'PNG')

        # 3. Adaptive Foreground (ic_launcher_foreground.png)
        # Safe zone in Android adaptive icons (108dp canvas) is 66-72dp.
        # Setting to 0.56 (approx 60dp on 108dp canvas) provides the exact same breathing room
        # and proportions as the top icon in Samsung One UI squircle mask without any cutoff!
        canvas_fg = Image.new('RGBA', (fg_size, fg_size), (0, 0, 0, 0))
        logo_fg_sz = int(fg_size * 0.56)
        logo_fg_resized = logo.resize((logo_fg_sz, logo_fg_sz), Image.Resampling.LANCZOS)
        offset_fg = ((fg_size - logo_fg_sz) // 2, (fg_size - logo_fg_sz) // 2)
        canvas_fg.paste(logo_fg_resized, offset_fg, logo_fg_resized)
        canvas_fg.save(os.path.join(folder_path, 'ic_launcher_foreground.png'), 'PNG')

        print(f"Generated icons in {folder} (legacy: {leg_size}px, fg: {fg_size}px)")

    print("All Android launcher icons generated successfully with perfect PWA-matched margins!")

if __name__ == '__main__':
    generate_icons()
