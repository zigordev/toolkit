import { StyleSheet, Text, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';
import { api } from '../src/api';

const palettes = {
  light: { background: '#ffffff', text: '#111111' },
  dark: { background: '#111111', text: '#f2f2f2' },
};

export default function Home() {
  const t = useTranslations('home');
  const palette = palettes[useColorScheme() === 'light' ? 'light' : 'dark'];
  const hello = api.useQuery('get', '/api/v1/hello');
  const greeting = hello.data?.message ?? (hello.isError ? t('apiDown') : '');
  return (
    <SafeAreaView style={[styles.page, { backgroundColor: palette.background }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>
        {t('title')}
      </Text>
      <Text testID="greeting" style={[styles.greeting, { color: palette.text }]}>
        {greeting}
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 24, gap: 12 },
  title: { fontSize: 32, fontWeight: '700' },
  greeting: { fontSize: 18 },
});
