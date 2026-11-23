import { checkHealth } from '@zigordev/otel';
import { pingApi } from '../../lib/api.ts';
import { getConfig } from '../../lib/config.ts';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const config = getConfig();
  const report = await checkHealth({
    service: config.OTEL_SERVICE_NAME,
    components: [{ name: 'api', required: false, check: () => pingApi(config.API_URL) }],
  });
  return Response.json(report.body, { status: report.statusCode });
}
