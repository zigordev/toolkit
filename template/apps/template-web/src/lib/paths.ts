export function localPath(value: string | undefined, fallback = '/account'): string {
  return value?.startsWith('/') === true && !value.startsWith('//') ? value : fallback;
}
