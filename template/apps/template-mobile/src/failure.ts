export interface QueryProgress {
  readonly data: unknown;
  readonly errorUpdateCount: number;
}

export function showsFailure(query: QueryProgress): boolean {
  return query.data === undefined && query.errorUpdateCount > 0;
}
