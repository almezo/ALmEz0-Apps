"""
يبني أيقونة التطبيق (اللوقو الخارجي) من اللوقو الداخلي almezo_logo.png بنفس الهوية:
مربع داكن بزوايا مستديرة وإطار أخضر #4CAF50.

كانت الأيقونة القديمة بلا إطار أخضر، واللوقو فيها صغير وسط حشو كبير، فلا تشبه هوية
البرنامج من الداخل.

ثلاثة مخرجات لكل كثافة:
  ic_launcher.png            الأيقونة المربعة (أندرويد < 26، ومنها صناديق التلفاز)
  ic_launcher_round.png      النسخة الدائرية للمشغّلات التي تطلبها
  ic_launcher_foreground.png طبقة الأيقونة التكيفية (أندرويد 26+)

ملاحظة مهمة في الأيقونة التكيفية: النظام يقص الطبقة بقناع (مربع ناعم في سامسونج، أو دائرة
في مشغّلات أخرى)، ولا يضمن ظهور إلا المربع الأوسط 72dp من 108dp. لذلك يوضع اللوقو المربع
بهذا المقاس بالضبط وخلفيته شفافة، فيظهر كما هو بإطاره الأخضر بلا أي شكل آخر حوله.

التشغيل: python scripts/build-launcher-icons.py   (يحتاج Pillow)
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
LOGO = os.path.join(RES, 'drawable-nodpi', 'almezo_logo.png')

GREEN = (76, 175, 80, 255)      # نفس أخضر إطار اللوقو الداخلي #4CAF50
DARK = (14, 13, 12, 255)        # داكن داخلي مطابق لخلفية اللوقو
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
FG_SIZES = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}

SS = 4  # رسم بدقة مضاعفة ثم تصغير، لحواف ناعمة بلا تسنين


def content(logo):
    """محتوى اللوقو داخل الإطار الأخضر (بلا الإطار نفسه)."""
    w, h = logo.size
    m = int(w * 0.085)
    return logo.crop((m, m, w - m, h - m))


def round_icon(logo, size):
    """دائرة داكنة بحلقة خضراء ومحتوى اللوقو في المنتصف."""
    n = size * SS
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    stroke = max(SS, int(n * 0.055))
    d.ellipse([0, 0, n - 1, n - 1], fill=DARK)

    inner = content(logo)
    box = int(n * 0.62)
    inner = inner.resize((box, box), Image.LANCZOS)
    mask = Image.new('L', (box, box), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, box - 1, box - 1], fill=255)
    off = (n - box) // 2
    img.paste(inner, (off, off), mask)

    d.ellipse([stroke // 2, stroke // 2, n - 1 - stroke // 2, n - 1 - stroke // 2],
              outline=GREEN, width=stroke)
    return img.resize((size, size), Image.LANCZOS)


def foreground(logo, size):
    """
    طبقة تكيفية: اللوقو المربع بحوافه الناعمة كما هو، داخل المساحة المضمونة الظهور.

    الخلفية شفافة (ic_launcher_background)، فالأيقونة تظهر كمربع ناعم الحواف بإطاره الأخضر
    بلا أي شكل آخر حوله. النسخة السابقة كانت حلقة دائرية داخل دائرة، فبدت شكلاً داخل شكل
    ولا تشبه هوية اللوقو.

    المربع بمقاس 55dp من 108dp: أبعد نقطة في زواياه تبقى داخل دائرة الأمان (36dp نصف قطر)،
    فيظهر الإطار الأخضر كاملاً على كل المشغّلات. جرّبنا 72dp فكان قناع سامسونج يقصّ أطرافه.
    """
    n = size * SS
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    # 55dp من 108: المربع بزواياه المستديرة يدخل كاملاً داخل أي قناع (حتى الدائري)،
    # فيظهر الإطار الأخضر كله. 72dp كان يساوي حدود القناع تماماً فكان يُقص من الأطراف.
    box = int(n * 55.0 / 108.0)
    logo_img = logo.resize((box, box), Image.LANCZOS)
    off = (n - box) // 2
    img.paste(logo_img, (off, off), logo_img)
    return img.resize((size, size), Image.LANCZOS)


def main():
    logo = Image.open(LOGO).convert('RGBA')
    for dens, size in SIZES.items():
        out = os.path.join(RES, 'mipmap-' + dens)
        os.makedirs(out, exist_ok=True)
        # المربعة: اللوقو الداخلي كما هو بإطاره الأخضر
        logo.resize((size, size), Image.LANCZOS).save(os.path.join(out, 'ic_launcher.png'))
        round_icon(logo, size).save(os.path.join(out, 'ic_launcher_round.png'))
        foreground(logo, FG_SIZES[dens]).save(os.path.join(out, 'ic_launcher_foreground.png'))
        print('%-8s square %dpx | round %dpx | foreground %dpx' % (dens, size, size, FG_SIZES[dens]))


if __name__ == '__main__':
    main()
