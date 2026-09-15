# Is x2t-wasm viable for Kiln?

A spike, run 15 September 2026. Throwaway branch `spike/x2t-wasm`; nothing under
`lib/registry/` was touched.

**Conclusion: adopt narrowly — conditional on a size measurement this sandbox
could not take, and on a licence decision only you can make.**

---

## What I could not measure, and why

**x2t itself was never built or run.** Every cheap path is closed from here:

| Path | Result |
| --- | --- |
| npm `x2t` | Unrelated — a Chinese-language xlsx→HTML tool, 28 KB, ISC |
| npm `x2t-wasm` | A 221-byte placeholder, one file, empty description |
| `cryptpad/onlyoffice-x2t-wasm` | Cloned. Build harness only; artifacts are `.gitignore`d |
| cryptpad.fr (ships a built `x2t.wasm`) | Blocked by the egress proxy (connection refused) |
| Building it | **Docker daemon is not available** in this sandbox, and `emcc` is not installed |

The build is not a near miss. The repo vendors ONLYOFFICE core at **686 MB**, and
the Dockerfile has ~20 stages that each clone and compile a dependency — boost,
ICU, OpenSSL, harfbuzz, brotli, libheif, hyphen — through emsdk. On a machine
with Docker this is a multi-gigabyte, long-running build, not a quick check.

So **questions 1, 2 and 3 are unanswered for x2t.** I am not going to put a
number on the `.wasm` size from memory; a figure you cannot trace is worse than
none. What I did instead was test the *approach* with a comparable artifact, and
measure the one real alternative properly.

### To get the x2t numbers yourself

On any machine with Docker and ~20 GB free:

```bash
git clone https://github.com/cryptpad/onlyoffice-x2t-wasm
cd onlyoffice-x2t-wasm
./build.sh                      # docker build --target output -o build .
ls -l build/                    # x2t.wasm + JS glue
gzip -9 -c build/x2t.wasm | wc -c
brotli -q 11 -c build/x2t.wasm | wc -c
```

Alternatively, open any CryptPad instance with devtools on the network tab and
read the transferred size of `x2t.wasm` directly — that is the shipped figure,
and it comes with brotli already applied by their server.

---

## What I did measure: the approach works

A 47.8 MB WebAssembly module **instantiated and ran inside a Web Worker in
Chromium**, converting a real file. That is the bar question 2 sets, and the
answer for a module of this size class is yes.

Two mechanics worth carrying forward:

- `new WebAssembly.Module(bytes)` on 47.8 MB is a synchronous compile. It is
  fine in a worker and would throw on the main thread, which suits Kiln — the
  worker already exists.
- The npm build ships the **wasm-bindgen Node target**, whose glue calls
  `require('fs')` to load the binary. A browser needs the `web` target or a
  patched loader. I patched it; a real integration should build the right target.

---

## office2pdf, measured properly

`@alexsun-top/office2pdf@0.1.1` — TypeScript bindings over the Rust crate
`office2pdf 0.6`, compiled to wasm32. This is the alternative from question 6,
and unlike x2t it is installable and testable from here.

### Size

| | Raw | gzip | brotli |
| --- | --- | --- | --- |
| `office2pdf_wasm_bg.wasm` | **47.8 MB** | 18.5 MB | **11.7 MB** |
| JS glue | 18.6 KB | 4.0 KB | — |

Measured with Node's `zlib` at maximum quality on the shipped artifact.

### Cost at runtime

Chromium, Web Worker, localhost:

| Input | Convert | wasm linear memory | JS heap | Output |
| --- | --- | --- | --- | --- |
| 9.9 KB docx | 146 ms | — | 1.6 MB | 27 KB, 1 page |
| 51 KB pptx | 144 ms | — | 1.6 MB | 12 KB, 2 pages |
| **4.31 MB docx** | **650–790 ms** | **92.4 MB** | 68.9 MB | 4.6 MB, 61 pages |

Instantiation is ~120–140 ms once per session. Conversion speed is genuinely
good — sub-second for a 4.3 MB document with 26 embedded images.

**Mobile Safari.** The concern is real but it is the *download*, not the compute.
11.7 MB brotli over a phone connection is the dominant cost, and Safari caches
compiled WASM poorly across sessions. 92.4 MB of linear memory for a 4.3 MB input
is survivable on modern iPhones but is roughly 20× the input; a 20 MB input would
be the thing to test before shipping. `metrics.pageCount` is also unreliable — it
reported 1 for a 61-page output — so do not build UI on it.

### Quality: `docx → pdf`, office2pdf vs Kiln today

Same source document, containing a table, an embedded PNG, and Greek, Cyrillic,
CJK and Arabic text. Renders in `docs/spike/`.

| | Kiln today (pdfmake + Helvetica) | office2pdf (Typst) |
| --- | --- | --- |
| Latin text | Clean | Clean |
| Greek | **Mojibake** | **Correct** |
| Cyrillic | **Mojibake** | **Correct** |
| CJK | **Mojibake** | **Blank** — glyphs dropped, no font |
| Arabic | **Mojibake** | Renders, but unshaped and word order reversed |
| Table | Correct columns and rules | **Badly broken** — columns overlap illegibly |
| Bold | Lost | Preserved |
| Image | Dropped | Dropped |
| Ligatures | Fine | **`fixture` renders as `f xture`** |
| Output | 2.6 KB | 27 KB |

**Plainly: neither is good, and neither dominates.** office2pdf is decisively
better on non-Latin text, which is the single worst failure Kiln has today.
Kiln is decisively better at tables, which are more common. Given the broken
table layout and the `fi` ligature bug, I would not swap Kiln's `docx → pdf` for
office2pdf as it stands.

### How many of the seven pairs does it solve?

**One.** office2pdf converts docx, xlsx and pptx **to PDF only**. Of the seven
unsupported pairs, it addresses `pptx → pdf` and nothing else — `docx → pdf` and
`xlsx → pdf` already work in Kiln. The other six all need a format Typst does not
write.

### Licence

The npm binding ships **Apache-2.0** (verified in its `LICENSE`). The underlying
Rust crate's licence I could **not** verify — crates.io and docs.rs are both
blocked by the proxy — so confirm `office2pdf 0.6` before relying on it.

---

## Licence: what AGPL-3.0 would mean for Kiln

Verified, not recalled: the vendored `core/LICENSE.txt` in CryptPad's repo is the
**GNU Affero General Public License v3**. I am not a lawyer and this is not
advice; it is the shape of the decision.

**The copyleft reach.** AGPL is GPL plus a network clause. Linking x2t into
Kiln's worker bundle almost certainly makes the combined work a derivative, so
Kiln's own source would have to be offered under AGPL-3.0 too. Kiln is currently
unlicensed in the repo, which is worth fixing either way.

**Does shipping WASM to a browser trigger the network clause?** This is the
genuinely unsettled part. AGPL §13 is triggered by users "interacting with it
remotely through a computer network". Kiln is the opposite case: the code is sent
*to* the user and runs entirely on their machine. A reasonable reading is that
§13 is not triggered, because nobody interacts with a remote instance — but the
plain §6 obligation to convey source alongside the binary still applies, and you
are conveying a binary to every visitor. The safe reading is that you must offer
complete corresponding source for Kiln *and* your x2t build.

**What compliance would take, concretely:**

1. License Kiln under AGPL-3.0.
2. Publish the exact x2t source and build scripts used, including CryptPad's
   patches, and keep them matched to the deployed binary.
3. Put a visible source offer in the interface and next to the `.wasm`.
4. Accept that anyone may fork Kiln commercially under the same terms.

**This is your call, not mine.** If Kiln is and stays open source, AGPL costs you
little. If you ever want to relicense, take investment, or ship a proprietary
variant, adopting x2t forecloses that — and unpicking it later means removing the
engine, not renegotiating. ONLYOFFICE do sell commercial licences for exactly
this situation; price unknown from here.

---

## Recommendation

**Adopt narrowly — as a lazy-loaded engine for the pairs that have no
alternative, never as a replacement for the light JS engines — conditional on:**

1. **Measuring the built size.** If brotli lands near office2pdf's 11.7 MB it is
   defensible for someone who currently gets nothing. Past ~40 MB it is not,
   even lazily, on a phone.
2. **Your answer on AGPL.** If the licence is unacceptable, this is a **reject**
   and the seven pairs stay honestly unsupported — which is a perfectly good
   outcome and already how the interface explains itself.

Not adopt-broadly: at this size it cannot replace mammoth or SheetJS, which cost
tens to hundreds of kilobytes. Kiln's page load must stay in its current class.

office2pdf is **not** a substitute for x2t here. It solves one of the seven pairs
and its `docx → pdf` is not better than Kiln's overall. It is worth keeping in
mind for one narrow purpose: it fixes non-Latin text, which is Kiln's worst
current output, if the table layout can be sorted out.

## What stage 4 should be, if you follow this

1. **Build x2t on a real machine** and fill in the three unmeasured numbers. One
   afternoon with Docker. Everything else waits on it.
2. **Decide the licence question** before any integration work — it is the only
   irreversible part.
3. If both clear: wire x2t behind the existing registry as `engineFor` entries
   for the seven pairs, with a one-time "this needs a large download" consent in
   the row. The architecture already supports it; nothing in the UI needs to
   change beyond that prompt.

## Two Kiln bugs this spike turned up

Neither is fixed here — this branch is throwaway and out of scope.

1. **Literal `**` leaks into PDF and DOCX tables.** Table cells run through
   `inlineToMarkdown`, so a bold heading cell becomes `**Region**` and the PDF
   writer prints the asterisks. Visible in `docs/spike/docx-to-pdf-kiln.png`.
   Table cells should use the plain-text renderer, like every other non-Markdown
   target.
2. **The pdfjs polyfill set may be incomplete.** Rendering a PDF needs
   `Map.prototype.getOrInsertComputed`, which is not in `lib/workers/polyfills.ts`.
   Kiln only extracts text today, which does not hit it — but if rendering is
   ever added, that is a third ES2026 method to shim.
