import type { Rule } from '../rule.ts';
import { actions } from './actions.ts';
import { attribution } from './attribution.ts';
import { comments } from './comments.ts';
import { docs } from './docs.ts';
import { flags } from './flags.ts';
import { identity } from './identity.ts';
import { links } from './links.ts';
import { migrations } from './migrations.ts';
import { scripts } from './scripts.ts';
import { shared } from './shared.ts';
import { texts } from './texts.ts';

export function rulesWith(source: string): readonly Rule[] {
  return [
    actions,
    attribution,
    comments,
    docs,
    flags,
    identity,
    links,
    migrations,
    scripts,
    shared(source),
    texts,
  ];
}
