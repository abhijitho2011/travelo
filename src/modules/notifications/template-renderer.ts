import { Logger } from '@nestjs/common';

const logger = new Logger('NotificationTemplateRenderer');

/** `{{ var }}` / `{{var}}` — dots and underscores allowed inside the name. */
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export type TemplateVars = Record<string, unknown>;

export interface RenderResult {
  text: string;
  /** Placeholders present in the template that no variable satisfied. */
  missing: string[];
}

/** Minimal HTML escaping — enough to keep a name with `<` out of an email body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Substitutes `{{var}}` placeholders.
 *
 * A missing (or null/undefined) variable leaves the placeholder EXACTLY as it
 * was written and is reported in `missing` — never the string "undefined",
 * which is the one thing an owner must never receive. The caller logs it.
 */
export function renderTemplate(
  template: string,
  vars: TemplateVars = {},
  opts: { escape?: boolean } = {},
): RenderResult {
  const missing: string[] = [];
  const text = template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = vars[name];
    if (value === undefined || value === null || value === '') {
      if (!missing.includes(name)) missing.push(name);
      return whole;
    }
    const asText = String(value);
    return opts.escape ? escapeHtml(asText) : asText;
  });
  return { text, missing };
}

/** Renders subject + body together and emits one warning per missing var. */
export function renderMessage(
  key: string,
  channel: string,
  template: { subject?: string | null; body: string },
  vars: TemplateVars = {},
): { subject?: string; body: string } {
  // Only the email body is treated as markup; SMS and IN_APP are plain text
  // and escaping them would render `&amp;` to a human.
  const escape = channel === 'EMAIL';
  const body = renderTemplate(template.body, vars, { escape });
  const subject = template.subject
    ? renderTemplate(template.subject, vars, { escape: false })
    : undefined;
  const missing = [...new Set([...body.missing, ...(subject?.missing ?? [])])];
  if (missing.length) {
    logger.warn(
      `Template ${key}/${channel} left ${missing.length} placeholder(s) unresolved: ${missing.join(', ')}`,
    );
  }
  return { subject: subject?.text, body: body.text };
}
