import MarkdownIt from 'markdown-it';

// Raw HTML is disabled, so Markdown can never inject markup; anything that
// looks like a tag renders as visible text.
const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

const LANGUAGE = /^[a-z0-9+#-]{1,20}$/i;

md.validateLink = isSafeLink;

md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const language = token.info.trim().split(/\s+/)[0];
  const languageClass = LANGUAGE.test(language) ? ` class="language-${language}"` : '';
  const label = LANGUAGE.test(language) ? language : 'text';
  return (
    `<div class="code-block" data-code-block data-language="${md.utils.escapeHtml(label)}">` +
    `<pre tabindex="0"><code${languageClass}>${md.utils.escapeHtml(token.content)}</code></pre>` +
    '</div>\n'
  );
};

md.renderer.rules.table_open = () => '<div class="article-table" tabindex="0"><table>\n';
md.renderer.rules.table_close = () => '</table></div>\n';

/**
 * Render article Markdown to HTML and collect what validation and the
 * template need: headings for the table of contents, links, images, and a
 * word count for reading time.
 */
export function renderArticleMarkdown(source) {
  const env = {};
  const tokens = md.parse(source, env);
  const headings = [];
  const links = [];
  const images = [];
  const problems = [];
  const usedIds = new Set();
  let wordCount = 0;

  tokens.forEach((token, index) => {
    if (token.type === 'heading_open') {
      const level = Number(token.tag.slice(1));
      const text = inlineText(tokens[index + 1]);
      if (level === 1) {
        problems.push(`Level-1 heading "${text}" is not allowed; the template owns the H1.`);
      }
      const id = uniqueId(slugify(text), usedIds);
      token.attrSet('id', id);
      if (level === 2 || level === 3) {
        headings.push({ level, id, text });
      }
    }

    if (token.type === 'inline') {
      wordCount += countWords(inlineText(token));
      for (const child of token.children ?? []) {
        if (child.type === 'link_open') {
          const href = child.attrGet('href');
          links.push(href);
          if (/^https?:\/\//i.test(href)) {
            child.attrSet('rel', 'noopener noreferrer');
          }
        }
        if (child.type === 'image') {
          const alt = child.children?.map((c) => c.content).join('') ?? '';
          images.push({ src: child.attrGet('src'), alt });
          if (!alt.trim()) {
            problems.push(`Image "${child.attrGet('src')}" has no alt text.`);
          }
          child.attrSet('loading', 'lazy');
          child.attrSet('decoding', 'async');
        }
      }
    }
  });

  return {
    html: md.renderer.render(tokens, md.options, env),
    headings,
    links,
    images,
    problems,
    wordCount,
  };
}

export function slugify(text) {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  return slug || 'section';
}

// Only web, mail, and same-site links; any other scheme (javascript:, data:,
// vbscript:, file:) and protocol-relative URLs are refused.
export function isSafeLink(url) {
  const value = url.trim();
  if (/^(?:https?:|mailto:)/i.test(value)) {
    return true;
  }
  return !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith('//');
}

// "Setup", "Setup", "Setup 2" must still produce three distinct ids.
function uniqueId(base, usedIds) {
  let id = base;
  for (let n = 2; usedIds.has(id); n += 1) {
    id = `${base}-${n}`;
  }
  usedIds.add(id);
  return id;
}

function inlineText(token) {
  if (!token?.children) {
    return token?.content ?? '';
  }
  return token.children
    .filter((child) => child.type === 'text' || child.type === 'code_inline')
    .map((child) => child.content)
    .join('');
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}
