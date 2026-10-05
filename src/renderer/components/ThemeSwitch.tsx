import { SegmentedControl, useMantineColorScheme } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export function ThemeSwitch() {
  const { t } = useTranslation();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <SegmentedControl
      size="xs"
      aria-label={t('theme.label')}
      value={colorScheme}
      onChange={(value) => setColorScheme(value)}
      data={[
        { value: 'light', label: t('theme.light') },
        { value: 'dark', label: t('theme.dark') },
        { value: 'auto', label: t('theme.auto') },
      ]}
    />
  );
}
