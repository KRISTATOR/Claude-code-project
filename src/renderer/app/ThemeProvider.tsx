import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';
import { createTheme, localStorageColorSchemeManager, MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import type { ReactNode } from 'react';

const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'sm',
  fontFamily: '"Segoe UI", system-ui, -apple-system, Roboto, "Noto Sans", sans-serif',
});

// The chosen look is a per-computer convenience, so browser storage is fine.
const colorSchemeManager = localStorageColorSchemeManager({ key: 'zazemi-color-scheme' });

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme="auto"
      colorSchemeManager={colorSchemeManager}
    >
      <ModalsProvider>
        <Notifications position="bottom-right" />
        {children}
      </ModalsProvider>
    </MantineProvider>
  );
}
