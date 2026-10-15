// NOTE: email clients ignore CSS custom properties and most <style> blocks, so these
// mirror apps/web/public/css/tokens.css as literal values for inline styles.
const COLORS = Object.freeze({
  page: '#f1f5f9',
  card: '#ffffff',
  header: '#0f172a',
  border: '#e2e8f0',
  panel: '#f8fafc',
  text: '#0f172a',
  body: '#334155',
  muted: '#64748b',
  // Brand orange-hover: white text on the brighter #e95420 is only 3.6:1.
  action: '#c9461a',
  successText: '#15803d',
  successBackground: '#dcfce7',
  dangerText: '#b91c1c',
  dangerBackground: '#fee2e2',
});

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

/**
 * Render one HelloDeploy email from a plain-content description.
 *
 * Every string is escaped here. A paragraph or note is either a string or an
 * array of parts, where `{ strong: text }` marks emphasis, so callers never
 * assemble HTML themselves.
 *
 * @returns {{ html: string, text: string }}
 */
export function renderEmail({
  platformUrl,
  preheader,
  heading,
  greeting,
  status,
  paragraphs = [],
  details = [],
  code,
  action,
  notes = [],
  footerNotes = [],
}) {
  return {
    html: renderHtml({
      platformUrl,
      preheader,
      heading,
      greeting,
      status,
      paragraphs,
      details,
      code,
      action,
      notes,
      footerNotes,
    }),
    text: renderText({ heading, greeting, paragraphs, details, code, action, notes, footerNotes }),
  };
}

export function escapeEmailHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderHtml({
  platformUrl,
  preheader,
  heading,
  greeting,
  status,
  paragraphs,
  details,
  code,
  action,
  notes,
  footerNotes,
}) {
  const body = [
    status ? renderStatus(status) : '',
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:${COLORS.text};">${escapeEmailHtml(heading)}</h1>`,
    greeting ? renderParagraph(greeting) : '',
    ...paragraphs.map(renderParagraph),
    details.length > 0 ? renderDetails(details) : '',
    code ? renderCode(code) : '',
    action ? renderButton(action) : '',
    ...notes.map(renderNote),
  ].join('');

  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light only">',
    `<title>${escapeEmailHtml(heading)}</title></head>`,
    `<body style="margin:0;padding:0;background:${COLORS.page};">`,
    preheader ? renderPreheader(preheader) : '',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.page};">`,
    '<tr><td align="center" style="padding:24px 12px;">',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:${FONT};">`,
    `<tr><td style="background:${COLORS.header};padding:18px 28px;border-radius:12px 12px 0 0;">${renderBrand(platformUrl)}</td></tr>`,
    `<tr><td style="background:${COLORS.card};padding:32px 28px 28px;border:1px solid ${COLORS.border};border-top:0;border-radius:0 0 12px 12px;">${body}</td></tr>`,
    `<tr><td style="padding:20px 28px 0;">${renderFooter({ platformUrl, action, footerNotes })}</td></tr>`,
    '</table></td></tr></table></body></html>',
  ].join('');
}

// Clients show this hidden line as the inbox preview instead of the first visible text.
function renderPreheader(preheader) {
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeEmailHtml(preheader)}</div>`;
}

function renderBrand(platformUrl) {
  const wordmark = `<span style="font-size:18px;font-weight:700;color:#ffffff;vertical-align:middle;">HelloDeploy</span>`;
  if (!platformUrl) {
    return wordmark;
  }
  // The wordmark stays real text so the brand still reads when images are blocked.
  const logo = `<img src="${escapeEmailHtml(`${platformUrl}/assets/brand/mark.png`)}" width="32" height="32" alt="HelloDeploy" style="display:inline-block;vertical-align:middle;border:0;margin-right:10px;">`;
  return `${logo}${wordmark}`;
}

function renderStatus({ label, tone }) {
  const isSuccess = tone === 'success';
  const color = isSuccess ? COLORS.successText : COLORS.dangerText;
  const background = isSuccess ? COLORS.successBackground : COLORS.dangerBackground;
  return `<p style="margin:0 0 12px;"><span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;color:${color};background:${background};">${escapeEmailHtml(label)}</span></p>`;
}

function renderParagraph(content) {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${COLORS.body};">${renderParts(content)}</p>`;
}

function renderNote(content) {
  return `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${COLORS.muted};">${renderParts(content)}</p>`;
}

function renderParts(content) {
  const parts = Array.isArray(content) ? content : [content];
  return parts
    .map((part) =>
      typeof part === 'object' && part !== null
        ? `<strong style="color:${COLORS.text};">${escapeEmailHtml(part.strong)}</strong>`
        : escapeEmailHtml(part),
    )
    .join('');
}

function renderDetails(details) {
  const rows = details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;font-size:13px;color:${COLORS.muted};white-space:nowrap;vertical-align:top;">${escapeEmailHtml(label)}</td>` +
        `<td style="padding:6px 0;font-size:14px;font-weight:600;color:${COLORS.text};word-break:break-word;">${escapeEmailHtml(value)}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;background:${COLORS.panel};border:1px solid ${COLORS.border};border-radius:8px;"><tr><td style="padding:12px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`;
}

function renderCode(code) {
  return `<p style="margin:4px 0 24px;padding:16px;text-align:center;background:${COLORS.panel};border:1px solid ${COLORS.border};border-radius:8px;font-family:${MONO};font-size:28px;font-weight:700;letter-spacing:6px;color:${COLORS.text};">${escapeEmailHtml(code)}</p>`;
}

// A table-cell button keeps its background in Outlook, which ignores padding on links.
function renderButton({ label, url }) {
  const href = escapeEmailHtml(url);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px;"><tr>` +
    `<td style="background:${COLORS.action};border-radius:8px;">` +
    `<a href="${href}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeEmailHtml(label)}</a>` +
    `</td></tr></table>`
  );
}

function renderFooter({ platformUrl, action, footerNotes }) {
  const style = `margin:0 0 8px;font-size:12px;line-height:1.5;color:${COLORS.muted};`;
  const lines = [];
  if (action) {
    const href = escapeEmailHtml(action.url);
    lines.push(
      `<p style="${style}">Button not working? Paste this link into your browser:<br><a href="${href}" style="color:${COLORS.muted};word-break:break-all;">${href}</a></p>`,
    );
  }
  for (const note of footerNotes) {
    lines.push(`<p style="${style}">${renderParts(note)}</p>`);
  }
  const host = platformUrl ? platformUrl.replace(/^https?:\/\//, '') : '';
  lines.push(`<p style="${style}">HelloDeploy${host ? ` · ${escapeEmailHtml(host)}` : ''}</p>`);
  return lines.join('');
}

function renderText({ heading, greeting, paragraphs, details, code, action, notes, footerNotes }) {
  const blocks = [heading];
  if (greeting) {
    blocks.push(toPlain(greeting));
  }
  blocks.push(...paragraphs.map(toPlain));
  if (details.length > 0) {
    blocks.push(details.map(([label, value]) => `${label}: ${value}`).join('\n'));
  }
  if (code) {
    blocks.push(code);
  }
  if (action) {
    blocks.push(`${action.label}: ${action.url}`);
  }
  blocks.push(...notes.map(toPlain), ...footerNotes.map(toPlain));
  return blocks.join('\n\n');
}

function toPlain(content) {
  const parts = Array.isArray(content) ? content : [content];
  return parts
    .map((part) => (typeof part === 'object' && part !== null ? part.strong : part))
    .join('');
}
