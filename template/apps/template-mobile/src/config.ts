export const defaultApiUrl = 'http://localhost:3000';

export function apiUrl(value: string | undefined = process.env.EXPO_PUBLIC_API_URL): string {
  const given = value?.trim() ?? '';
  return (given === '' ? defaultApiUrl : given).replace(/\/+$/, '');
}
