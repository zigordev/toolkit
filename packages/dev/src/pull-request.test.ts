import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const template = read('../shared/.github/pull_request_template.md');
const skill = read('../shared/.claude/skills/finish-work/SKILL.md');

const sections = template
  .split(/^## /m)
  .slice(1)
  .map((section) => {
    const [heading = '', ...body] = section.split('\n');
    return { heading, body: body.join('\n').trim() };
  });

const headings = sections.map((section) => section.heading);

describe('the pull request template', () => {
  it('has the six sections, in the decided order', () => {
    expect(headings).toEqual([
      'What',
      'Why',
      'How it was tested',
      'Observability',
      'Docs',
      'Follow-ups',
    ]);
  });

  it('holds nothing before its first section', () => {
    expect(template.startsWith('## What\n')).toBe(true);
  });

  it('says under every section what belongs there', () => {
    for (const section of sections) {
      expect(section.body, section.heading).not.toBe('');
    }
  });

  it('holds no hidden note, because the description becomes the commit', () => {
    expect(template).not.toContain('<!--');
  });

  it('has the sections that the finish-work skill names', () => {
    const named = /description has these sections: ([^.]+)\./.exec(skill)?.[1];
    expect(named?.split(', ')).toEqual(headings);
  });
});
