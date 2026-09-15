# Non-Latin text in PDF output

The same document rendered by Kiln's PDF path, before and after the font change.

`before-helvetica.png` is pdfmake driven by the base-14 Helvetica: the glyphs are
never embedded, the font is addressed through a single-byte encoding roughly the
size of Latin-1, and every character above U+00FF is written as raw UTF-16 code
units reinterpreted as Latin-1. Greek, Cyrillic, CJK, Arabic, Hebrew and emoji
all come out as confident garbage, and the conversion reports success.

`after-roboto.png` is the same content with pdfmake's bundled Roboto embedded.
Latin, Latin Extended, Greek, Cyrillic, the punctuation set, `€`, `½` and the
`fi` ligature are all correct. The scripts Roboto has no glyphs for no longer
appear at all: they are replaced with `U+FFFD` and named in `warnings`, and a
document with nothing else in it is refused rather than converted.

Regenerate by rendering a PDF with pdfjs in Chromium — there is no rasteriser in
CI, so these are checked in rather than produced by a test.
