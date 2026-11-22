import { escapeHtml, withBasePath } from './utils.mjs';

function slugifyHeading(text, usedIds) {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-') || 'section';
  let id = base;
  let count = 2;
  while (usedIds.has(id)) {
    id = `${base}-${count++}`;
  }
  usedIds.add(id);
  return id;
}

function renderInline(text, basePath = '') {
  let html = escapeHtml(text);

  // Inline code
  html = html.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);

  // Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Markdown links: [label](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, rawUrl) => {
    const url = rawUrl.trim();
    if (url.startsWith('/go/')) {
      const resolved = withBasePath(url, basePath);
      return `<a href="${escapeHtml(resolved)}" class="affiliate-link" rel="sponsored noopener noreferrer" data-go-link="true">${label}</a>`;
    }
    if (url.startsWith('/')) {
      return `<a href="${escapeHtml(withBasePath(url, basePath))}">${label}</a>`;
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    return `<a href="${escapeHtml(url)}">${label}</a>`;
  });

  return html;
}

function isTableSeparator(line) {
  return /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(line);
}

function splitTableRow(line) {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

export function renderMarkdown(markdown, { basePath = '' } = {}) {
  const lines = String(markdown || '').split(/\r?\n/);
  const htmlParts = [];
  const toc = [];
  const usedIds = new Set();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      htmlParts.push(`<pre><code${langClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // Headings (H2 / H3 / H4)
    const headingMatch = line.match(/^(#{2,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const rawTitle = headingMatch[2].trim();
      const id = slugifyHeading(rawTitle, usedIds);
      if (level === 2 || level === 3) {
        toc.push({ level, id, text: rawTitle });
      }
      htmlParts.push(`<h${level} id="${escapeHtml(id)}">${renderInline(rawTitle, basePath)}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      htmlParts.push('<hr />');
      i++;
      continue;
    }

    // GFM Table
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableRow(line);
      i += 2; // skip header & separator
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      const thead = `<thead><tr>${headers.map((h) => `<th>${renderInline(h, basePath)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows
        .map((r) => `<tr>${headers.map((_, idx) => `<td>${renderInline(r[idx] || '', basePath)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`;
      htmlParts.push(`<div class="table-wrap"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    // Blockquote
    if (line.trim().startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      htmlParts.push(`<blockquote><p>${renderInline(quoteLines.join(' '), basePath)}</p></blockquote>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      htmlParts.push(`<ul>${items.map((item) => `<li>${renderInline(item, basePath)}</li>`).join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      htmlParts.push(`<ol>${items.map((item) => `<li>${renderInline(item, basePath)}</li>`).join('')}</ol>`);
      continue;
    }

    // Paragraph
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !/^(#{2,4})\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith('>') &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      if (lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        break;
      }
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length > 0) {
      htmlParts.push(`<p>${renderInline(paraLines.join(' '), basePath)}</p>`);
    }
  }

  return {
    html: htmlParts.join('\n'),
    toc,
  };
}
