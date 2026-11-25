export const languages = ['en', 'es'] as const;

export type Language = (typeof languages)[number];

export interface EmailTemplate {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export type Email = EmailTemplate;

export type StandardTemplates = Record<'verifyEmail', Record<Language, EmailTemplate>>;

const placeholder = /\{\{([a-z][a-zA-Z0-9]*)\}\}/g;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function placeholdersOf(template: EmailTemplate): string[] {
  const names = new Set<string>();
  for (const part of [template.subject, template.html, template.text]) {
    for (const [, name = ''] of part.matchAll(placeholder)) {
      names.add(name);
    }
  }
  return [...names].sort();
}

export function fillEmail(
  template: EmailTemplate,
  values: Readonly<Record<string, string>>
): Email {
  const asked = placeholdersOf(template);
  const missing = asked.filter((name) => values[name] === undefined);
  if (missing.length > 0) {
    throw new Error(`The email needs a value for ${missing.join(', ')}`);
  }
  const extra = Object.keys(values).filter((name) => !asked.includes(name));
  if (extra.length > 0) {
    throw new Error(`The email has no place for ${extra.join(', ')}`);
  }
  const link = values.link;
  if (link !== undefined && !/^https?:\/\//.test(link)) {
    throw new Error('The link of an email starts with https:// or http://');
  }
  const fill = (text: string, encode: (value: string) => string) =>
    text.replace(placeholder, (_, name: string) => encode(values[name] ?? ''));
  return {
    subject: fill(template.subject, (value) => value),
    html: fill(template.html, escapeHtml),
    text: fill(template.text, (value) => value),
  };
}
