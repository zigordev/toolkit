import { getNextAuth } from '../../../../lib/auth.ts';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Promise<Response> {
  return getNextAuth().handlers.GET(request);
}

export function POST(request: Request): Promise<Response> {
  return getNextAuth().handlers.POST(request);
}
