export const sideNavCookie = 'ds-side-nav';

export function sideNavOpen(value: string | undefined): boolean | undefined {
  if (value === 'open') return true;
  if (value === 'closed') return false;
  return undefined;
}
