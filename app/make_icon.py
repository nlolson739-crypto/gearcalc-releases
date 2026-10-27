"""Draws gearcalc.ico: the app's gold sword on a dark rounded square (same mark as the header)."""
from PIL import Image, ImageDraw

S = 256
GOLD = (240, 180, 76, 255)


def draw(size: int) -> Image.Image:
    k = 4  # supersample
    n = size * k
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.22, fill=(26, 29, 35, 255))
    u = n / 24  # the header icon is drawn on a 24-unit grid
    w = max(1, round(2.2 * u))
    p = lambda pts: [(x * u, y * u) for x, y in pts]
    d.line(p([(19.5, 18.5), (6, 5), (5, 5), (5, 6), (18.5, 19.5)]), fill=GOLD, width=w, joint='curve')
    d.line(p([(13.5, 19.5), (19.5, 13.5)]), fill=GOLD, width=w)
    d.line(p([(16.5, 16.5), (20.5, 20.5)]), fill=GOLD, width=w)
    d.line(p([(19.5, 21.5), (21.5, 19.5)]), fill=GOLD, width=w)
    return im.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else 'gearcalc.ico'
    draw(S).save(out, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    draw(512).save(out.replace('.ico', '.png'))
