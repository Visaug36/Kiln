# The CJK fonts

`NotoSansJP.ttf` and `NotoSansSC.ttf` are what Recast embeds when a document
contains Chinese, Japanese or Korean text and the target is PDF. Roboto, which
every other PDF uses, has no CJK glyphs at all.

They are served from Recast's own origin like every other font here: nothing is
fetched from a CDN, and the worker only asks for one when a conversion actually
needs it.

## Where they came from

Noto Sans JP 5.3.0 and Noto Sans SC 5.2.8, the `japanese` and
`chinese-simplified` subsets published by [Fontsource](https://fontsource.org),
which repackages Google's Noto. Licensed under the SIL Open Font License 1.1 —
the full text is in `OFL.txt`.

Fontsource ships `.woff2`. These are the same fonts converted to `.ttf`:

```bash
python3 -c "
from fontTools.ttLib import TTFont
f = TTFont('noto-sans-jp-japanese-400-normal.woff2'); f.flavor = None
f.save('NotoSansJP.ttf')"
```

## Why TTF and not the smaller woff2

woff2 halves the download — 0.97 MB against 2.25 MB for the Japanese face — and
pdfmake accepts either. But pdfkit only subsets a font it can read through
fontkit's TrueType path, and a woff2 goes down a path that embeds the **whole**
face in every file it writes. The same three-line test document came out at

| Font shipped | Download | PDF produced |
| ------------ | -------- | ------------ |
| `.woff2`     | 0.97 MB  | 2988 KB      |
| `.ttf`       | 2.25 MB  | 14 KB        |

The download happens once a session; the bloat would happen in every file a
person converts and keeps. So TTF, and the extra 1.3 MB is the price.

## Why two files and not one pan-CJK font

A pan-CJK face is three to four times the size, and almost nobody needs both at
once. Recast picks by what is in the document: kana means Japanese, otherwise
Simplified Chinese. Each is fetched on its own, so a Japanese document never
downloads the Chinese face.
