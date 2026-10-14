# Models

## `u2netp.onnx`

U²-Net "portable" — salient object detection, the model behind the subject
mask. 2.3 MB, 320×320 in, a single 320×320 probability map out.

| | |
| --- | --- |
| Licence | Apache-2.0 |
| Paper | Qin et al., *U²-Net: Going Deeper with Nested U-Structure for Salient Object Detection*, Pattern Recognition 106 (2020) |
| Source | https://github.com/xuebinqin/U-2-Net |
| ONNX export | https://huggingface.co/BritishWerewolf/U-2-Netp |
| Trained on | DUTS-TR |

Committed rather than fetched, unlike the ONNX Runtime WebAssembly, which the
build emits straight out of `node_modules`. That one is reproducible from
`package-lock.json`; this is not on npm, and a build that reaches the network
for a required asset is a build that breaks the day the host does.

## Precision

The weights are **float16**, converted from the published float32 export with
`onnxconverter_common.float16` and `keep_io_types=True`, so the graph still
takes and returns float32 and nothing around it has to know. That halves the
file, 4.36 MB to 2.26 MB, for an IoU against the original of 0.97 to 0.9997 on
the frames it was checked against, and about 5% on inference — measured under
ONNX Runtime Web, single-threaded, warm-up discarded.

**Do not quantise this to int8.** It was tried. Dynamic int8 quantisation
produces a model that returns an empty mask — IoU 0.0000, entirely black
output — and runs four times slower into the bargain. U²-Net's nested RSU
blocks carry activation ranges too wide for per-tensor dynamic quantisation,
and the saving of a further megabyte is not available at any acceptable price.

See [THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md).

## `migan.onnx`

MI-GAN — image inpainting, the model behind the retouch brush's smart fill.
14.2 MB. Takes an RGB crop and a hole mask as bytes at any size; works on a
512×512 square around the hole and pastes the answer back, every pixel outside
the hole left as it was.

| | |
| --- | --- |
| Licence | MIT (code and weights) |
| Paper | Sargsyan et al., *MI-GAN: A Simple Baseline for Image Inpainting on Mobile Devices*, ICCV 2023 |
| Source | https://github.com/Picsart-AI-Research/MI-GAN |
| ONNX export | https://huggingface.co/andraniksargsyan/migan (`migan_pipeline_v2.onnx`) |
| Trained on | Places2, 512×512 |

The mask is 255 where the picture is known and 0 in the hole — the opposite of
what the name suggests, and the one convention there is to get wrong.

### Precision

The **weights** are float16; the arithmetic is not. The published export is
the authors' "pipeline" graph, which does its own pre- and post-processing in
float32, and `onnxconverter_common.float16` breaks on the casts inside it. So
every large constant is stored as float16 and cast back to float32 where it is
read — see `scripts/migan-fp16.py`, which reproduces this file byte for byte.
28.1 MB becomes 14.2 MB, and no output byte differs from the float32 model's
by more than one level. About 0.9 s a fill under ONNX Runtime Web,
single-threaded, whatever the size of the crop.

Chosen for size: it is the smallest of the usual inpainters by a distance —
LaMa's published export is about 200 MB, AOT-GAN's about 60 MB. It is only
asked to fill what a heal cannot; everything else never reaches it.

## `realesr-general-x4v3.onnx`

Real-ESRGAN "general" x4 v3 — super-resolution, the model behind the upscale
offer and the export dialog's Upscale row. 4.9 MB. Takes an RGB picture as
float32 NCHW in 0..1 at any size and returns it four times larger on each
edge; ×2 is the same pass halved on the way out.

| | |
| --- | --- |
| Licence | BSD-3-Clause |
| Paper | Wang et al., *Real-ESRGAN: Training Real-World Blind Super-Resolution with Pure Synthetic Data*, ICCVW 2021 |
| Source | https://github.com/xinntao/Real-ESRGAN (release v0.2.5.0, `realesr-general-x4v3.pth`) |
| ONNX export | https://huggingface.co/skillsafe-ai/realesr-general-x4v3 (`model.onnx`, float32) |
| Architecture | SRVGGNetCompact: 32 3×3 convolutions at 64 channels, PReLU, pixel shuffle |

Float32, unaltered. The float16 export halves the file, but the download is
dwarfed by the runtime it needs: this model runs on ONNX Runtime's WebGPU
build, which is 27 MB against the detector's 14, and is fetched separately
the first time a photo is upscaled.

Run tiled — 256 px tiles with 16 px of overlap on WebGPU, 192 px on the CPU —
because the model's memory grows with the picture. Measured on an Apple
M-series laptop: about a quarter of a second per 512² of input on WebGPU, and
thirteen seconds on the CPU, which is why the CPU is only offered a small
picture.

## `mobilenetv2-12-int8.onnx`

MobileNetV2 — the ImageNet classifier behind the auto look's scene tag. 3.7 MB,
224×224 in, 1000 logits out. It knows *things*, not scenes, so the app sums its
probabilities over the things a scene is made of (food on a plate, a ski, a
streetcar, a jersey on somebody — see `src/editor/auto-look/scene-classes.ts`,
generated from the Model Zoo's `synset.txt`). Sunsets, night and portraits
have no classes to speak of; the picture's own statistics decide those.

| | |
| --- | --- |
| Licence | Apache-2.0 |
| Paper | Sandler et al., *MobileNetV2: Inverted Residuals and Linear Bottlenecks*, CVPR 2018 |
| Source | https://github.com/onnx/models (`validated/vision/classification/mobilenet`, `mobilenetv2-12-int8.onnx`) |
| Trained on | ImageNet-1k |
| SHA-256 | `cc028fe6cae7bc11a4ff53cfc9b79c920e8be65ce33a904ec3e2a8f66d77f95f` |

Int8, as the Model Zoo publishes it: quantised by its maintainers, who report
its ImageNet accuracy within about a point of the float32 original, at a
quarter of the size. The smallest thing that does the job; a true scene
classifier (Places365) would be 45 MB, or 11 MB quantised, for a tag that the
statistics already get right where it matters most.

Fetched the first time a photo is opened with the auto look on, from our own
origin, and kept by the service worker — together with the subject detector
above, which the auto look also runs: skin on the *subject* is what makes a
portrait, and the classifier cannot see a person who is small in the frame or
wrapped in a towel. Both share one runtime, so the first open fetches it once. Runs on the CPU in the analysis
worker, after the statistics it sits beside, which are what the look is built
from first — so a slow first fetch delays the scene tag, never the look.
