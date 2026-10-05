import {
  AppShell,
  Group,
  Kbd,
  NavLink,
  ScrollArea,
  Select,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { spotlight } from '@mantine/spotlight';
import {
  IconFolders,
  IconHome,
  IconMap2,
  IconSearch,
  IconSettings,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink as RouterLink, Route, Routes, useLocation } from 'react-router';
import { CommandPalette } from '../components/CommandPalette';
import { StatusBanner } from '../components/StatusBanner';
import { SyncBadge } from '../components/SyncBadge';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { UpdateBanner } from '../components/UpdateBanner';
import { DrivePage } from '../drive/DrivePage';
import { EditingIndicator } from '../drive/EditingIndicator';
import { HomePage } from './pages/HomePage';
import { PeoplePage } from './pages/PeoplePage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { TrashPage } from './pages/TrashPage';
import { WorldsPage } from './pages/WorldsPage';
import { useTeam, useWorkspace } from './workspace';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  organizerOnly?: boolean;
}

export function Shell() {
  const { t } = useTranslation();
  const { team, isOrganizer } = useTeam();
  const { teams, setTeamId } = useWorkspace();
  const location = useLocation();

  const items: NavItem[] = [
    { to: '/', label: t('nav.home'), icon: <IconHome size={18} /> },
    { to: '/svety', label: t('nav.worlds'), icon: <IconMap2 size={18} /> },
    { to: '/disk', label: t('nav.drive'), icon: <IconFolders size={18} /> },
    { to: '/hledat', label: t('nav.searchPage'), icon: <IconSearch size={18} /> },
    { to: '/lide', label: t('nav.people'), icon: <IconUsers size={18} />, organizerOnly: true },
    { to: '/kos', label: t('nav.trash'), icon: <IconTrash size={18} />, organizerOnly: true },
    { to: '/nastaveni', label: t('nav.settings'), icon: <IconSettings size={18} /> },
  ];

  return (
    <AppShell header={{ height: 52 }} navbar={{ width: 220, breakpoint: 0 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Title order={3}>{t('app.name')}</Title>
            <UnstyledButton onClick={() => spotlight.open()} aria-label={t('nav.search')}>
              <Group
                gap={6}
                px="sm"
                py={4}
                style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 6 }}
              >
                <IconSearch size={14} />
                <Text size="sm" c="dimmed">
                  {t('nav.search')}
                </Text>
                <Kbd size="xs">{t('nav.searchShortcut')}</Kbd>
              </Group>
            </UnstyledButton>
          </Group>
          <Group gap="md" wrap="nowrap">
            <EditingIndicator />
            <SyncBadge />
            <ThemeSwitch />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <Stack gap="xs" h="100%">
          {teams && teams.length > 1 ? (
            <Select
              size="xs"
              label={t('nav.switchTeam')}
              data={teams.map((item) => ({ value: item.id, label: item.name }))}
              value={team.id}
              onChange={(value) => value && setTeamId(value)}
              allowDeselect={false}
            />
          ) : (
            <Text size="xs" c="dimmed" px="xs" data-testid="team-name">
              {team.name}
            </Text>
          )}
          <ScrollArea flex={1}>
            {items
              .filter((item) => !item.organizerOnly || isOrganizer)
              .map((item) => (
                <NavLink
                  key={item.to}
                  component={RouterLink}
                  to={item.to}
                  label={item.label}
                  leftSection={item.icon}
                  active={
                    item.to === '/'
                      ? location.pathname === '/'
                      : location.pathname.startsWith(item.to)
                  }
                />
              ))}
          </ScrollArea>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main>
        <UpdateBanner />
        <StatusBanner />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/svety" element={<WorldsPage />} />
          <Route path="/svety/:id" element={<WorldsPage />} />
          <Route path="/disk" element={<DrivePage />} />
          <Route path="/hledat" element={<SearchPage />} />
          <Route path="/lide" element={<PeoplePage />} />
          <Route path="/kos" element={<TrashPage />} />
          <Route path="/nastaveni" element={<SettingsPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </AppShell.Main>
      <CommandPalette />
    </AppShell>
  );
}
