/** DOCX editabile (libreria `docx`): stili titolo reali, tabelle, elenchi. */
import { AlignmentType, Document, HeadingLevel, Packer, PageBreak, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, type IRunOptions } from 'docx';
import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
import type { Token, Tokens } from 'marked';
import { lex, stripLeadingH1 } from '../book/markdown';
import { TRIM_SIZES } from '../kdp/specs';
import type { BookBundle } from '../types';
import { copyrightLines, sortedChapters } from './interior';
import type { StructureReport } from './epub';

type Block = Paragraph | Table;

function runs(tokens: Token[] | undefined, style: IRunOptions = {}): TextRun[] {
  if (!tokens) return [];
  return tokens.flatMap((t): TextRun[] => {
    switch (t.type) {
      case 'strong': return runs((t as Tokens.Strong).tokens, { ...style, bold: true });
      case 'em': return runs((t as Tokens.Em).tokens, { ...style, italics: true });
      case 'del': return runs((t as Tokens.Del).tokens, { ...style, strike: true });
      case 'link': return runs((t as Tokens.Link).tokens, style);
      case 'codespan': return [new TextRun({ ...style, text: (t as Tokens.Codespan).text, font: 'Courier New' })];
      case 'br': return [new TextRun({ ...style, break: 1 })];
      case 'checkbox': return [];
      case 'text': {
        const x = t as Tokens.Text;
        return x.tokens ? runs(x.tokens, style) : [new TextRun({ ...style, text: decode(x.text) })];
      }
      default: return [new TextRun({ ...style, text: decode('text' in t ? String(t.text) : 'raw' in t ? String(t.raw) : '') })];
    }
  });
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function blocks(tokens: Token[], indent = 0): Block[] {
  return tokens.flatMap((t): Block[] => {
    switch (t.type) {
      case 'heading': {
        const h = t as Tokens.Heading;
        const level = h.depth <= 2 ? HeadingLevel.HEADING_2 : h.depth === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4;
        return [new Paragraph({ heading: level, children: runs(h.tokens) })];
      }
      case 'paragraph': return [new Paragraph({ children: runs((t as Tokens.Paragraph).tokens), spacing: { after: 160 }, indent: indent ? { left: indent } : undefined })];
      case 'text': return [new Paragraph({ children: runs((t as Tokens.Text).tokens ?? [t]), indent: indent ? { left: indent } : undefined })];
      case 'list': {
        const l = t as Tokens.List;
        return l.items.flatMap((it, i) => {
          const first = it.tokens.find((x) => x.type === 'text' || x.type === 'paragraph') as Tokens.Text | Tokens.Paragraph | undefined;
          const rest = it.tokens.filter((x) => x !== first && x.type !== 'checkbox');
          const marker = it.task ? (it.checked ? '☑ ' : '☐ ') : l.ordered ? `${Number(l.start || 1) + i}. ` : '• ';
          return [
            new Paragraph({ children: [new TextRun(marker), ...runs(first?.tokens ?? [])], indent: { left: 360 + indent, hanging: 260 }, spacing: { after: 80 } }),
            ...blocks(rest, indent + 360),
          ];
        });
      }
      case 'blockquote':
        return (t as Tokens.Blockquote).tokens.flatMap((b) =>
          b.type === 'paragraph'
            ? [new Paragraph({ children: runs((b as Tokens.Paragraph).tokens), indent: { left: 400, right: 200 }, shading: { fill: 'EFEFEF' }, border: { left: { style: 'single', size: 18, color: '555555', space: 8 } }, spacing: { before: 120, after: 120 } })]
            : blocks([b], 400),
        );
      case 'table': {
        const tb = t as Tokens.Table;
        const row = (cells: Tokens.TableCell[], header: boolean) =>
          new TableRow({ tableHeader: header, children: cells.map((c) => new TableCell({ children: [new Paragraph({ children: runs(c.tokens, header ? { bold: true } : {}) })], shading: header ? { fill: 'E6E6E6' } : undefined })) });
        return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [row(tb.header, true), ...tb.rows.map((r) => row(r, false))] }), new Paragraph({ text: '' })];
      }
      case 'hr': return [new Paragraph({ text: '* * *', alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 } })];
      case 'code': return [new Paragraph({ children: [new TextRun({ text: (t as Tokens.Code).text, font: 'Courier New' })] })];
      case 'space': return [];
      default: return 'raw' in t && String(t.raw).trim() ? [new Paragraph({ text: String(t.raw).trim() })] : [];
    }
  });
}

const md = (text: string) => blocks(lex(stripLeadingH1(text)));
const h1 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, text, pageBreakBefore: true });

export async function buildDocx(bundle: BookBundle, year = new Date().getFullYear()): Promise<Uint8Array> {
  const { project } = bundle;
  const trim = TRIM_SIZES[project.layout.trim];
  const tw = (inch: number) => Math.round(inch * 1440);
  const children: Block[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, text: project.title, alignment: AlignmentType.CENTER, spacing: { before: 2400 } }),
    ...(project.subtitle ? [new Paragraph({ children: [new TextRun({ text: project.subtitle, italics: true, size: 28 })], alignment: AlignmentType.CENTER, spacing: { before: 240 } })] : []),
    new Paragraph({ children: [new TextRun({ text: project.author, size: 24 })], alignment: AlignmentType.CENTER, spacing: { before: 1200 } }),
    new Paragraph({ children: [new PageBreak()] }),
    ...copyrightLines(project, year).map((l) => new Paragraph({ children: [new TextRun({ text: l, size: 18 })], spacing: { after: 100 } })),
  ];
  if (project.matter.dedication.trim()) children.push(new Paragraph({ children: [new TextRun({ text: project.matter.dedication, italics: true })], alignment: AlignmentType.CENTER, pageBreakBefore: true, spacing: { before: 2400 } }));
  if (project.matter.preface.trim()) children.push(h1('Prefazione'), ...md(project.matter.preface));
  for (const c of sortedChapters(bundle.chapters)) children.push(h1(`${c.position}. ${c.title}`), ...md(c.content));
  if (project.matter.conclusion.trim()) children.push(h1('Conclusione'), ...md(project.matter.conclusion));
  if (project.glossary.length) children.push(h1('Glossario'), ...project.glossary.map((g) => new Paragraph({ children: [new TextRun({ text: `${g.term}: `, bold: true }), new TextRun(g.definition)], spacing: { after: 120 } })));
  const verified = project.sources.filter((s) => s.verified && s.citation.trim());
  if (verified.length) children.push(h1('Bibliografia'), ...verified.map((s) => new Paragraph({ text: `${s.citation}${s.url ? ` ${s.url}` : ''}`, spacing: { after: 120 } })));
  if (project.matter.acknowledgments.trim()) children.push(h1('Ringraziamenti'), ...md(project.matter.acknowledgments));
  if (project.matter.authorBio.trim()) children.push(h1('L’autore'), ...md(project.matter.authorBio));

  const doc = new Document({
    creator: project.author || 'FOLYNTRA AI',
    title: project.title,
    description: project.subtitle,
    styles: { default: { document: { run: { font: 'Garamond', size: 23 }, paragraph: { spacing: { line: 320 } } } } },
    sections: [{ properties: { page: { size: { width: tw(trim.widthIn), height: tw(trim.heightIn) }, margin: { top: tw(0.75), bottom: tw(0.75), left: tw(0.75), right: tw(0.6) } } }, children }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

export async function validateDocx(data: Uint8Array): Promise<StructureReport> {
  const problems: string[] = [];
  const zip = await JSZip.loadAsync(data);
  for (const p of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml']) {
    const f = zip.file(p);
    if (!f) {
      problems.push(`parte mancante: ${p}`);
      continue;
    }
    const v = XMLValidator.validate(await f.async('string'));
    if (v !== true) problems.push(`XML non ben formato in ${p}: ${v.err.msg}`);
  }
  return { ok: problems.length === 0, problems };
}
