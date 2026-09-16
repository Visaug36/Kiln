/**
 * The OpenDocument, EPUB, HTML and JSON fixtures.
 *
 * Kept out of `make-fixtures.mjs` only for length. The important thing about
 * them is what they are *not*: with the exception of ODS, which SheetJS writes,
 * these are not produced by Kiln's own writers. They are written here by hand
 * in the dialect LibreOffice and real EPUB tooling actually emit — different
 * style names, different attribute order, markup Kiln never generates — because
 * a reader tested only against its matching writer proves nothing except that
 * the two agree with each other.
 *
 * The EPUB is the sharpest case. Its chapter files are deliberately named so
 * that archive order, alphabetical order and spine order are all different. A
 * reader that ignores the spine produces a book whose chapters are shuffled,
 * and every individual chapter still reads perfectly.
 */

const CONTENT_NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"',
].join(' ');

const MANIFEST = (mime, extra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
<manifest:file-entry manifest:full-path="/" manifest:media-type="${mime}"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
${extra}</manifest:manifest>`;

/** Packs an ODF archive the way the specification requires: mimetype, stored, first. */
async function packOdf(JSZip, mime, content, extra = {}) {
  const zip = new JSZip();
  zip.file('mimetype', mime, { compression: 'STORE' });
  zip.file(
    'META-INF/manifest.xml',
    MANIFEST(
      mime,
      Object.keys(extra)
        .map(
          (name) =>
            `<manifest:file-entry manifest:full-path="${name}" manifest:media-type="image/png"/>\n`,
        )
        .join(''),
    ),
  );
  zip.file(
    'styles.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles ${CONTENT_NS} office:version="1.3"><office:styles/></office:document-styles>`,
  );
  zip.file('content.xml', content);
  for (const [name, data] of Object.entries(extra)) zip.file(name, data);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

export async function writeOdfFixtures(write, MARKER) {
  const { default: JSZip } = await import('jszip');

  // ---- ODT: LibreOffice's own shape, down to the T1/T2/L1 style names ----
  {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${CONTENT_NS} office:version="1.3">
<office:automatic-styles>
<style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="T2" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
<text:list-style style:name="L1"><text:list-level-style-bullet text:level="1" text:bullet-char="•"/><text:list-level-style-bullet text:level="2" text:bullet-char="◦"/></text:list-style>
<text:list-style style:name="L2"><text:list-level-style-number text:level="1" style:num-format="1"/></text:list-style>
</office:automatic-styles>
<office:body><office:text>
<text:sequence-decls><text:sequence-decl text:display-outline-level="0" text:name="Illustration"/></text:sequence-decls>
<text:h text:style-name="Heading_20_1" text:outline-level="1">Field notes</text:h>
<text:p text:style-name="Standard">${MARKER}</text:p>
<text:h text:style-name="Heading_20_2" text:outline-level="2">Observations</text:h>
<text:p text:style-name="Standard">A paragraph with <text:span text:style-name="T1">bold</text:span> and <text:span text:style-name="T2">italic</text:span> runs, plus <text:a xlink:href="https://example.com">a link</text:a>.</text:p>
<text:p text:style-name="Standard">A line<text:line-break/>broken in two.<text:note text:id="ftn1" text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body><text:p>A footnote Kiln has nowhere to put.</text:p></text:note-body></text:note></text:p>
<text:list text:style-name="L1">
<text:list-item><text:p text:style-name="Standard">First item</text:p></text:list-item>
<text:list-item><text:p text:style-name="Standard">Second item</text:p>
<text:list text:style-name="L1"><text:list-item><text:p text:style-name="Standard">Nested item</text:p></text:list-item></text:list>
</text:list-item>
<text:list-item><text:p text:style-name="Standard">Third item</text:p></text:list-item>
</text:list>
<text:list text:style-name="L2">
<text:list-item><text:p text:style-name="Standard">Step one</text:p></text:list-item>
<text:list-item><text:p text:style-name="Standard">Step two</text:p></text:list-item>
</text:list>
<text:p text:style-name="Quotations">A quoted line.</text:p>
<text:p text:style-name="Preformatted_20_Text">code(); // fenced</text:p>
<table:table table:name="Table1">
<table:table-column table:number-columns-repeated="3"/>
<table:table-row><table:table-cell office:value-type="string"><text:p>Region</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Units</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Revenue</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell office:value-type="string"><text:p>North</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>120</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>2400</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell table:number-columns-spanned="2" office:value-type="string"><text:p>Merged across two</text:p></table:table-cell><table:covered-table-cell/><table:table-cell office:value-type="string"><text:p>4000</text:p></table:table-cell></table:table-row>
</table:table>
<draw:frame draw:name="Frame1" svg:width="8cm" svg:height="2cm"><draw:text-box><text:p text:style-name="Standard">Text inside a floating frame.</text:p></draw:text-box></draw:frame>
<text:p text:style-name="Standard">Closing paragraph.</text:p>
</office:text></office:body>
</office:document-content>`;

    write(
      'sample.odt',
      await packOdf(JSZip, 'application/vnd.oasis.opendocument.text', content, {
        'Pictures/10000001.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      }),
    );
  }

  // ---- ODS: written by SheetJS, so the reader meets a third party's file ----
  {
    const XLSX = await import('@e965/xlsx');
    const book = XLSX.utils.book_new();

    const first = XLSX.utils.aoa_to_sheet([
      ['Region', 'Units', 'Revenue'],
      ['North', 120, 2400],
      ['South', 80, 1600],
      ['Total', 200, 4000],
    ]);
    XLSX.utils.book_append_sheet(book, first, 'Sales');
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([['Note'], [MARKER]]),
      'Notes',
    );

    write(
      'sample.ods',
      Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'ods' })),
    );
  }

  // ---- ODP: title frames declared, and one deliberately written last ----
  {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${CONTENT_NS} office:version="1.3">
<office:automatic-styles/>
<office:body><office:presentation>
<draw:page draw:name="page1" draw:master-page-name="Default">
<draw:frame presentation:class="title" draw:layer="layout" svg:x="1.4cm" svg:y="0.8cm" svg:width="25cm" svg:height="2cm"><draw:text-box><text:p>Opening slide</text:p></draw:text-box></draw:frame>
<draw:frame presentation:class="outline" draw:layer="layout" svg:x="1.4cm" svg:y="4cm" svg:width="25cm" svg:height="10cm"><draw:text-box><text:p>${MARKER}</text:p></draw:text-box></draw:frame>
</draw:page>
<draw:page draw:name="page2" draw:master-page-name="Default">
<draw:frame presentation:class="outline" draw:layer="layout" svg:x="1.4cm" svg:y="4cm" svg:width="25cm" svg:height="10cm"><draw:text-box><text:list><text:list-item><text:p>Point one</text:p></text:list-item><text:list-item><text:p>Point two</text:p></text:list-item></text:list></draw:text-box></draw:frame>
<draw:frame presentation:class="title" draw:layer="layout" svg:x="1.4cm" svg:y="0.8cm" svg:width="25cm" svg:height="2cm"><draw:text-box><text:p>Second slide</text:p></draw:text-box></draw:frame>
<presentation:notes><draw:frame><draw:text-box><text:p>A speaker note.</text:p></draw:text-box></draw:frame></presentation:notes>
</draw:page>
</office:presentation></office:body>
</office:document-content>`;

    write(
      'sample.odp',
      await packOdf(JSZip, 'application/vnd.oasis.opendocument.presentation', content),
    );
  }

  // ---- EPUB: spine order disagrees with both archive and alphabetical order ----
  {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
    );

    const chapter = (title, body) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${title}</title></head>
<body><section epub:type="chapter"><h1>${title}</h1>${body}</section></body>
</html>`;

    // Added in an order that is neither the spine's nor alphabetical.
    zip.file(
      'EPUB/xhtml/zeta.xhtml',
      chapter('Chapter two', '<p>The middle of the book.</p>'),
    );
    zip.file(
      'EPUB/xhtml/alpha.xhtml',
      chapter(
        'Chapter three',
        '<p>The end of the book.</p><ul><li>One</li><li>Two</li></ul>',
      ),
    );
    zip.file(
      'EPUB/xhtml/mid.xhtml',
      chapter('Chapter one', `<p>${MARKER}</p><p>The beginning of the book.</p>`),
    );
    zip.file(
      'EPUB/nav.xhtml',
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><ol><li><a href="xhtml/mid.xhtml">Chapter one</a></li></ol></nav></body>
</html>`,
    );
    zip.file('EPUB/images/cover.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    zip.file(
      'EPUB/package.opf',
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="pub-id">urn:uuid:fixture-0001</dc:identifier>
<dc:title>A test book</dc:title>
<dc:language>en</dc:language>
<meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="cover" href="images/cover.png" media-type="image/png"/>
<item id="one" href="xhtml/mid.xhtml" media-type="application/xhtml+xml"/>
<item id="two" href="xhtml/zeta.xhtml" media-type="application/xhtml+xml"/>
<item id="three" href="xhtml/alpha.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine>
<itemref idref="one"/>
<itemref idref="two"/>
<itemref idref="three"/>
</spine>
</package>`,
    );

    write('sample.epub', Buffer.from(await zip.generateAsync({ type: 'nodebuffer' })));
  }

  // ---- HTML: a page, not a fragment — head, chrome, script and all ----
  write(
    'sample.html',
    Buffer.from(
      `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Quarterly report</title>
<style>body { font-family: serif; }</style>
<link rel="stylesheet" href="/site.css">
</head>
<body>
<nav><a href="/">Home</a></nav>
<h1>Quarterly report</h1>
<p>${MARKER}</p>
<h2>Findings</h2>
<p>Revenue rose in <strong>every</strong> region, though <em>slowly</em>. See <a href="https://example.com">the note</a>.</p>
<img src="chart.png" alt="A chart">
<ul>
  <li>First bullet</li>
  <li>Second bullet
    <ul><li>Nested bullet</li></ul>
  </li>
</ul>
<ol><li>Step one</li><li>Step two</li></ol>
<blockquote><p>A quoted line.</p></blockquote>
<pre><code>code(); // fenced</code></pre>
<table>
  <thead><tr><th>Region</th><th>Units</th></tr></thead>
  <tbody><tr><td>North</td><td>120</td></tr><tr><td>South</td><td>80</td></tr></tbody>
</table>
<div>Loose text in a div.</div>
<script>console.log('ignored');</script>
</body>
</html>
`,
      'utf8',
    ),
  );

  // ---- JSON: records, with a nested object and an array value ----
  write(
    'sample.json',
    Buffer.from(
      `${JSON.stringify(
        [
          {
            region: 'North',
            units: 120,
            revenue: 2400,
            lead: { name: 'Ada', office: 'Leeds' },
            tags: ['priority', 'q1'],
          },
          {
            region: 'South',
            units: 80,
            revenue: 1600,
            lead: { name: 'Grace', office: 'Bath' },
            tags: ['q1'],
          },
          {
            region: 'Note',
            units: 0,
            revenue: 0,
            lead: { name: MARKER, office: '' },
            tags: [],
          },
        ],
        null,
        2,
      )}\n`,
      'utf8',
    ),
  );
}
