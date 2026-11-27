import { describe, expect, it } from 'vitest';
import { showsFailure } from './failure';

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
