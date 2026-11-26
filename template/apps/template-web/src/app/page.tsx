import { getTranslations } from 'next-intl/server';
import { getGreeting } from '../lib/api.ts';
import { getConfig } from '../lib/config.ts';
import { getLogger } from '../lib/logger.ts';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const t = await getTranslations('home');
  const greeting = await getGreeting({ url: getConfig().API_URL, logger: getLogger() });
  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{greeting ?? t('apiDown')}</p>
      <p>
        <a href="/account">{t('account')}</a>
      </p>
    </main>
  );
}
