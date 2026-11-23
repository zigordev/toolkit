import { BlockList, isIPv4, isIPv6 } from 'node:net';
import rateLimit, { normalizeIP } from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ProblemError } from './problems.ts';

export interface RateLimitOptions {
  readonly max: number;
  readonly windowMs: number;
}

export const defaultRateLimit: RateLimitOptions = { max: 300, windowMs: 60_000 };

const privateRanges = new BlockList();
privateRanges.addSubnet('10.0.0.0', 8, 'ipv4');
privateRanges.addSubnet('172.16.0.0', 12, 'ipv4');
privateRanges.addSubnet('192.168.0.0', 16, 'ipv4');
privateRanges.addSubnet('127.0.0.0', 8, 'ipv4');
privateRanges.addSubnet('fc00::', 7, 'ipv6');
privateRanges.addAddress('::1', 'ipv6');

export function isPrivateAddress(address: string): boolean {
  const plain = address.toLowerCase().startsWith('::ffff:') ? address.slice(7) : address;
  if (isIPv4(plain)) {
    return privateRanges.check(plain, 'ipv4');
  }
  return isIPv6(plain) && privateRanges.check(plain, 'ipv6');
}

export function trustOneProxy(address: string, hop: number): boolean {
  return hop === 0 && isPrivateAddress(address);
}

export function clientAddress(request: FastifyRequest): string {
  const header = request.headers['cf-connecting-ip'];
  const fromCloudflare = typeof header === 'string' ? header.trim() : '';
  return normalizeIP(fromCloudflare === '' ? request.ip : fromCloudflare);
}

export async function limitRate(app: FastifyInstance, options: RateLimitOptions): Promise<void> {
  await app.register(rateLimit, {
    max: options.max,
    timeWindow: options.windowMs,
    keyGenerator: clientAddress,
    errorResponseBuilder: (_request, context) =>
      new ProblemError({
        status: 429,
        code: 'request.rate_limited',
        detail: `This client sent too many requests. Try again in ${context.after}.`,
        params: { limit: context.max, retryAfter: context.after },
      }),
  });
}
