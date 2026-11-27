export interface QueryProgress {
  readonly data: unknown;
  readonly errorUpdateCount: number;
}

export function showsFailure(query: QueryProgress): boolean {
  return query.data === undefined && query.errorUpdateCount > 0;
}

export function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return typeof error.status === 'number' ? error.status : undefined;
  }
  return undefined;
}

export function isRefused(error: unknown): boolean {
  const status = statusOf(error);
  return status !== undefined && status >= 400 && status < 500;
}
