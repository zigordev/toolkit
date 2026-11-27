import { describe, expect, it } from 'vitest';
import { isRefused, showsFailure, statusOf } from './failure';

describe('showsFailure', () => {
  it('shows nothing while the first answer is still on its way', () => {
    expect(showsFailure({ data: undefined, errorUpdateCount: 0 })).toBe(false);
  });

  it('keeps showing the failure while the screen asks again', () => {
    expect(showsFailure({ data: undefined, errorUpdateCount: 1 })).toBe(true);
    expect(showsFailure({ data: undefined, errorUpdateCount: 3 })).toBe(true);
  });

  it('shows the answer once it arrives, even after a failure', () => {
    expect(showsFailure({ data: { message: 'Hello' }, errorUpdateCount: 2 })).toBe(false);
  });
});

describe('statusOf', () => {
  it('reads the status of a problem the API answered', () => {
    expect(statusOf({ status: 401, title: 'Unauthorized' })).toBe(401);
  });

  it('finds none in a failure without a status', () => {
    expect(statusOf(new TypeError('Network request failed'))).toBeUndefined();
    expect(statusOf(undefined)).toBeUndefined();
    expect(statusOf({ status: '401' })).toBeUndefined();
  });
});

describe('isRefused', () => {
  it('names an answer from 400 to 499, which asking again would not change', () => {
    expect([399, 400, 401, 404, 499, 500].map((status) => isRefused({ status }))).toEqual([
      false,
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(isRefused(new TypeError('Network request failed'))).toBe(false);
  });
});
