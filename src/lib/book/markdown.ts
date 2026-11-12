/**
 * Markdown → XHTML rigoroso (valido sia per il PDF via Chromium sia per EPUB).
 * L'HTML grezzo nel sorgente viene sempre mostrato come testo, mai eseguito.
 */
import { marked, type Token, type Tokens } from 'marked';
import { escapeXml } from '../utils';

export function lex(markdown: string): Token[] {
  return marked.lexer(markdown, { gfm: true });
}

/** Rimuove un eventuale H1 iniziale (il titolo capitolo è reso a parte). */
export function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^\s*#\s+[^\n]*\n+/, '');
}

function safeHref(href: string): string | null {
  return /^(https?:|mailto:)/i.test(href) ? href : null;
}

export function inlineToXhtml(tokens: Token[] | undefined): string {
  if (!tokens) return '';
  return tokens
    .map((t) => {
      switch (t.type) {
        case 'strong': return `<strong>${inlineToXhtml((t as Tokens.Strong).tokens)}</strong>`;
        case 'em': return `<em>${inlineToXhtml((t as Tokens.Em).tokens)}</em>`;
        case 'del': return `<del>${inlineToXhtml((t as Tokens.Del).tokens)}</del>`;
        case 'codespan': return `<code>${escapeXml((t as Tokens.Codespan).text)}</code>`;
        case 'br': return '<br/>';
        case 'link': {
          const l = t as Tokens.Link;
          const href = safeHref(l.href);
          const inner = inlineToXhtml(l.tokens);
          return href ? `<a href="${escapeXml(href)}">${inner}</a>` : inner;
        }
        case 'image': return escapeXml((t as Tokens.Image).text);
        case 'escape': return escapeXml((t as Tokens.Escape).text);
        case 'text': {
          const x = t as Tokens.Text;
          return x.tokens ? inlineToXhtml(x.tokens) : escapeXml(decodeEntities(x.text));
        }
        default: return escapeXml('raw' in t ? String(t.raw) : '');
      }
    })
    .join('');
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export function tokensToXhtml(tokens: Token[]): string {
  return tokens
    .map((t) => {
      switch (t.type) {
        case 'heading': {
          const h = t as Tokens.Heading;
          const level = Math.min(4, Math.max(2, h.depth));
          return `<h${level}>${inlineToXhtml(h.tokens)}</h${level}>`;
        }
        case 'paragraph': return `<p>${inlineToXhtml((t as Tokens.Paragraph).tokens)}</p>`;
        case 'text': return `<p>${inlineToXhtml((t as Tokens.Text).tokens ?? [t])}</p>`;
        case 'list': {
          const l = t as Tokens.List;
          const tag = l.ordered ? 'ol' : 'ul';
          const items = l.items
            .map((it) => {
              const box = it.task ? `<span class="checkbox${it.checked ? ' checked' : ''}"></span> ` : '';
              // marked inserisce un token 'checkbox' per le attività: lo rendiamo noi con uno span.
              const toks = it.tokens.filter((x) => (x.type as string) !== 'checkbox');
              const inner = toks.length === 1 && toks[0].type === 'text' ? inlineToXhtml((toks[0] as Tokens.Text).tokens ?? [toks[0]]) : tokensToXhtml(toks).replace(/^<p>([\s\S]*?)<\/p>/, '$1');
              return `<li>${box}${inner}</li>`;
            })
            .join('');
          return `<${tag}>${items}</${tag}>`;
        }
        case 'blockquote': return `<blockquote class="callout">${tokensToXhtml((t as Tokens.Blockquote).tokens)}</blockquote>`;
        case 'table': {
          const tb = t as Tokens.Table;
          const head = `<tr>${tb.header.map((c) => `<th>${inlineToXhtml(c.tokens)}</th>`).join('')}</tr>`;
          const rows = tb.rows.map((r) => `<tr>${r.map((c) => `<td>${inlineToXhtml(c.tokens)}</td>`).join('')}</tr>`).join('');
          return `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
        }
        case 'hr': return '<hr/>';
        case 'code': return `<pre><code>${escapeXml((t as Tokens.Code).text)}</code></pre>`;
        case 'space': return '';
        default: return 'raw' in t && String(t.raw).trim() ? `<p>${escapeXml(String(t.raw).trim())}</p>` : '';
      }
    })
    .join('\n');
}

export function markdownToXhtml(markdown: string): string {
  return tokensToXhtml(lex(stripLeadingH1(markdown)));
}

/** Titoli H2/H3 presenti nel testo, per confrontarli con l'indice previsto. */
export function extractHeadings(markdown: string): { depth: number; text: string }[] {
  return lex(markdown)
    .filter((t): t is Tokens.Heading => t.type === 'heading')
    .map((h) => ({ depth: h.depth, text: h.text.trim() }));
}
