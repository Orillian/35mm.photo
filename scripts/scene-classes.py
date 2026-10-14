#!/usr/bin/env python3
"""
Regenerate src/editor/auto-look/scene-classes.ts from the ONNX Model Zoo's
ImageNet-1k label list (scripts/imagenet-synset.txt, next to this file).

The classifier knows objects, not scenes. A scene is the probability mass over
the objects it is made of, and this is the table that says which objects
belong to which scene. Keyword rules, matched as whole words against each
class's names; a class lands in the first scene (in PRIORITY order) that
claims it, so every class belongs to at most one scene.

    python3 scripts/scene-classes.py > src/editor/auto-look/scene-classes.ts
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
labels = [l.strip().split(' ', 1) for l in open(os.path.join(HERE, 'imagenet-synset.txt'))]
assert len(labels) == 1000
names = [n.lower() for _, n in labels]

def has(i, *words):
    return any(re.search(r'\b' + re.escape(w) + r'\b', names[i]) for w in words)

RULES = {
    'landscape': ['alp', 'valley', 'cliff', 'lakeside', 'promontory', 'geyser', 'volcano', 'coral reef', 'dam', 'viaduct',
                  'suspension bridge', 'steel arch bridge', 'boathouse', 'barn', 'mountain tent', 'hay', 'rapeseed', 'daisy',
                  'castle', 'pier', 'breakwater', 'stone wall', 'worm fence', 'picket fence', 'maze', 'lighthouse', 'beacon',
                  'windmill', 'water tower', 'thatch', 'yurt', 'balloon', 'airship', 'megalith', 'cliff dwelling',
                  'mountain bike', 'bison', 'elk', 'ox', 'zebra', 'gazelle', 'impala', 'hartebeest', 'ibex', 'bighorn', 'ram',
                  'llama', 'camel', 'horse cart', 'oxcart', 'plow', 'harvester', 'thresher', 'tractor'],
    'snow': ['ski', 'snowmobile', 'dogsled', 'bobsled', 'snowplow', 'ski mask', 'seashore', 'sandbar', 'snorkel', 'scuba diver',
             'catamaran', 'trimaran', 'schooner', 'yawl', 'speedboat', 'lifeboat', 'canoe', 'paddle', 'swimming trunks',
             'bikini', 'maillot', 'sunscreen', 'sea lion', 'king penguin', 'sea anemone', 'jellyfish', 'starfish', 'sea urchin',
             'sea cucumber'],
    'interior': ['dining table', 'studio couch', 'home theater', 'library', 'bookshop', 'bookcase', 'shoji', 'window shade',
                 'window screen', 'fire screen', 'four-poster', 'rocking chair', 'folding chair', 'throne', 'table lamp',
                 'lampshade', 'desk', 'wardrobe', 'china cabinet', 'chiffonier', 'dishwasher', 'microwave', 'refrigerator',
                 'stove', 'toaster', 'washer', 'bathtub', 'shower curtain', 'toilet seat', 'medicine chest', 'barber chair',
                 'restaurant', 'grocery store', 'butcher shop', 'tobacco shop', 'toyshop', 'confectionery', 'shoe shop',
                 'altar', 'monitor', 'desktop computer', 'television', 'entertainment center', 'vase', 'pillow', 'quilt',
                 'radiator', 'space heater', 'sliding door', 'prayer rug', 'doormat', 'coffee mug', 'coffeepot', 'teapot',
                 'tray', 'plate', 'wine bottle', 'goblet', 'candle', 'piano', 'grand piano', 'upright', 'organ'],
    'street': ['streetcar', 'trolleybus', 'traffic light', 'street sign', 'cab', 'minibus', 'parking meter', 'manhole cover',
               'fire engine', 'police van', 'ambulance', 'garbage truck', 'tow truck', 'trailer truck', 'moving van',
               'limousine', 'jinrikisha', 'unicycle', 'bicycle-built-for-two', 'motor scooter', 'moped', 'pole', 'bannister',
               'cinema', 'fountain', 'triumphal arch', 'palace', 'mosque', 'monastery', 'church', 'bell cote', 'dome',
               'obelisk', 'totem pole', 'pickup', 'sports car', 'convertible', 'racer', 'school bus', 'passenger car',
               'freight car', 'electric locomotive', 'steam locomotive', 'tram', 'crane', 'shopping cart', 'newsstand',
               'mailbox', 'scoreboard', 'flagpole', 'billboard', 'umbrella', 'park bench', 'turnstile', 'pay-phone',
               'street lamp', 'go-kart', 'golfcart', 'rickshaw', 'scooter', 'vending machine', 'grille'],
    # Things worn or used by a person — and the things a baby is wrapped in or laid in,
    # which the classifier sees instead of the baby.
    'portrait': ['suit', 'jersey', 't-shirt', 'sweatshirt', 'cardigan', 'bow tie', 'windsor tie', 'sunglasses', 'sunglass',
                 'hair spray', 'lipstick', 'wig', 'cowboy hat', 'sombrero', 'bonnet', 'mortarboard', 'academic gown',
                 'miniskirt', 'jean', 'lab coat', 'kimono', 'sarong', 'abaya', 'trench coat', 'fur coat', 'poncho', 'cloak',
                 'gown', 'stole', 'neck brace', 'mask', 'crash helmet', 'football helmet', 'pickelhaube', 'bearskin',
                 'bulletproof vest', 'breastplate', 'cuirass', 'military uniform', 'pajama', 'brassiere', 'hoopskirt',
                 'overskirt', 'feather boa', 'stethoscope', 'hair slide', 'bib', 'diaper', 'apron', 'necklace', 'groom',
                 'scuba diver', 'ballplayer', 'oxygen mask', 'harmonica', 'microphone', 'violin', 'cello', 'acoustic guitar',
                 'electric guitar', 'sax', 'trombone', 'flute', 'oboe', 'cornet', 'french horn', 'drum', 'maraca', 'banjo',
                 'accordion', 'bassoon', 'sunscreen', 'swimming trunks', 'running shoe', 'sandal', 'loafer', 'clog',
                 'bath towel', 'crib', 'cradle', 'bassinet'],
}
# Food is the whole n07 synset range (the food branch of WordNet), less the two
# that are paper — a menu is a document, and so is a comic book.
FOOD_EXTRA = ['wok', 'frying pan', 'spatula', 'mixing bowl', 'soup bowl', 'corkscrew', 'cleaver', 'rotisserie',
              'espresso maker', 'plate', 'dining table']
NOT_FOOD = ['menu', 'comic book']
PRIORITY = ['food', 'snow', 'portrait', 'street', 'interior', 'landscape']

out = {scene: {i for i in range(1000) if has(i, *words)} for scene, words in RULES.items()}
out['food'] = {i for i, (sid, _) in enumerate(labels) if sid.startswith('n07') and not has(i, *NOT_FOOD)}
out['food'] |= {i for i in range(1000) if has(i, *FOOD_EXTRA)}
seen = set()
for sc in PRIORITY:
    out[sc] = sorted(i for i in out[sc] if i not in seen)
    seen |= set(out[sc])

w = sys.stdout.write
w('/**\n * Which ImageNet-1k classes say which scene. GENERATED by scripts/scene-classes.py\n')
w(" * from the Model Zoo's `synset.txt` — edit the rules there, not this file.\n *\n")
w(' * The classifier knows objects, not scenes, so a scene is the mass of probability\n')
w(' * over the things found in it — food on a plate, a ski, a streetcar, a jersey on a\n')
w(' * person, the towel a baby is wrapped in. Night and sunset have no classes to speak\n')
w(' * of; the statistics decide those. Each class belongs to at most one scene.\n */\n')
w("export const SCENE_CLASSES: Record<'landscape' | 'snow' | 'interior' | 'street' | 'portrait' | 'food', readonly number[]> = {\n")
for sc in ['landscape', 'snow', 'interior', 'street', 'portrait', 'food']:
    arr = out[sc]
    rows = [', '.join(str(x) for x in arr[k:k + 18]) for k in range(0, len(arr), 18)]
    w(f"  {sc}: [\n    " + ",\n    ".join(rows) + ",\n  ],\n")
w('}\n\n/** The first name of each class the table uses, for the readout beside the scene. */\n')
w('export const CLASS_LABEL: Record<number, string> = {\n')
for i in sorted(seen):
    name = names[i].split(',')[0].replace("'", "\\'")
    w(f"  {i}: '{name}',\n")
w('}\n')
print(f'# {sum(len(v) for v in out.values())} classes over {len(out)} scenes', file=sys.stderr)
