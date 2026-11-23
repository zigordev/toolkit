import { getGreeting } from '../lib/api.ts';
import { getConfig } from '../lib/config.ts';
import { getLogger } from '../lib/logger.ts';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const greeting = await getGreeting({ url: getConfig().API_URL, logger: getLogger() });
  return (
    <main>
      <h1>Template</h1>
      <p>{greeting ?? 'The API does not answer.'}</p>
    </main>
  );
}
