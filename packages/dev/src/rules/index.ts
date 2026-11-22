import type { Rule } from '../rule.ts';
import { actions } from './actions.ts';
import { comments } from './comments.ts';
import { docs } from './docs.ts';
import { identity } from './identity.ts';
import { links } from './links.ts';
import { scripts } from './scripts.ts';
import { shared } from './shared.ts';

export function rulesWith(source: string): readonly Rule[] {
  return [actions, comments, docs, identity, links, scripts, shared(source)];
}
