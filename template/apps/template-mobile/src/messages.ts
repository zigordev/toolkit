import en from '../../template-web/messages/en.json';
import es from '../../template-web/messages/es.json';
import type { Locale } from './locale';

export const messages: Readonly<Record<Locale, typeof en>> = { en, es };
