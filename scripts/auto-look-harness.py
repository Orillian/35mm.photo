"""
Decode a list of photographs the way the app would (EXIF-rotated, 256 px on the
long edge), run the scene classifier and the subject detector over them, and
dump what the app would see — pixels, probabilities, subject maps, a manifest,
and a contact sheet to judge against. Read by src/editor/auto-look/harness.test.ts.

    python3 scripts/auto-look-harness.py photos.txt outdir

Needs: onnxruntime numpy pillow (pip install, in a venv).
"""
import sys, json, os, glob, io
import numpy as np
from PIL import Image, ImageOps, ImageDraw, ImageFont
import onnxruntime as ort

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'models')
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
files = [l.rstrip('\n') for l in open(sys.argv[1])] if sys.argv[1].endswith('.txt') else sys.argv[1:]
cls = ort.InferenceSession(os.path.join(ROOT, 'mobilenetv2-12-int8.onnx'), providers=['CPUExecutionProvider'])
sal = ort.InferenceSession(os.path.join(ROOT, 'u2netp.onnx'), providers=['CPUExecutionProvider'])
MEAN = np.array([0.485, 0.456, 0.406], np.float32); STD = np.array([0.229, 0.224, 0.225], np.float32)

def softmax(x):
    e = np.exp(x - x.max()); return e / e.sum()

manifest = []
thumbs = []
for n, path in enumerate(files):
    try:
        im = Image.open(path)
        exif = im.getexif()
        iso = exif.get(34855) if exif else None
        im = ImageOps.exif_transpose(im).convert('RGB')
    except Exception as e:
        print('skip', path, e); continue
    w, h = im.size
    s = 256 / max(w, h)
    small = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.BILINEAR)
    rgba = np.dstack([np.asarray(small), np.full(small.size[::-1], 255, np.uint8)]).astype(np.uint8)
    key = f'{n:03d}'
    rgba.tofile(os.path.join(OUT, key + '.rgba'))
    # classifier: centre square of the small copy, to 224
    sw, sh = small.size; side = min(sw, sh)
    sq = small.crop(((sw - side) // 2, (sh - side) // 2, (sw - side) // 2 + side, (sh - side) // 2 + side)).resize((224, 224), Image.BILINEAR)
    x = (np.asarray(sq).astype(np.float32) / 255 - MEAN) / STD
    x = x.transpose(2, 0, 1)[None]
    logits = cls.run(None, {cls.get_inputs()[0].name: x})[0][0]
    probs = softmax(logits).astype(np.float32)
    probs.tofile(os.path.join(OUT, key + '.probs'))
    # subject detector: 320 square (stretched, as the app does), ImageNet-normalised
    im320 = small.resize((320, 320), Image.BILINEAR)
    y = (np.asarray(im320).astype(np.float32) / 255 - MEAN) / STD
    y = y.transpose(2, 0, 1)[None]
    fused = sal.run(None, {sal.get_inputs()[0].name: y})[0][0, 0]
    lo, hi = fused.min(), fused.max()
    mask = ((fused - lo) / max(hi - lo, 1e-6) * 255).astype(np.uint8)
    mask.tofile(os.path.join(OUT, key + '.mask'))
    top = [int(i) for i in np.argsort(-probs)[:5]]
    manifest.append({'key': key, 'file': os.path.basename(path), 'dir': os.path.basename(os.path.dirname(path)), 'width': small.size[0], 'height': small.size[1], 'iso': int(iso) if iso else None, 'top': top, 'topP': [float(probs[i]) for i in top]})
    thumbs.append((key, small.copy()))
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)

# contact sheet: 6 across, each 256 wide box with the key drawn on
cols = 6; cell = 260
rows = (len(thumbs) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cell, rows * (cell + 20)), (20, 20, 20))
d = ImageDraw.Draw(sheet)
for i, (key, t) in enumerate(thumbs):
    x = (i % cols) * cell; y = (i // cols) * (cell + 20)
    t2 = t.copy(); t2.thumbnail((cell - 8, cell - 8))
    sheet.paste(t2, (x + 4, y + 4))
    d.text((x + 6, y + cell - 2), key, fill=(255, 220, 120))
sheet.save(os.path.join(OUT, 'sheet.jpg'), quality=80)
print('dumped', len(manifest))
