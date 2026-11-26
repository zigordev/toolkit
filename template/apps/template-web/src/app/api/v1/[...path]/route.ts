import { forwardToApi } from '@zigordev/auth/next';
import { getConfig } from '../../../../lib/config.ts';
import { getLogger } from '../../../../lib/logger.ts';

export const dynamic = 'force-dynamic';

function forward(request: Request): Promise<Response> {
  return forwardToApi(getConfig().API_URL, getLogger())(request);
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
