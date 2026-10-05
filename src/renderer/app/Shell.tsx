import {
  Alert,
  AppShell,
  Button,
  Divider,
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
  IconBooks,
  IconCalendarTime,
  IconFlag,
  IconFolders,
  IconHierarchy2,
  IconHome,
  IconMap2,
  IconMasksTheater,
  IconSearch,
  IconSettings,
  IconTimeline,
  IconTrash,
  IconUser,
  IconUsers,
  IconUsersGroup,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { NavLink as RouterLink, Route, Routes, useLocation } from 'react-router';
import { CommandPalette, type PaletteItem } from '../components/CommandPalette';
import { StatusBanner } from '../components/StatusBanner';
import { SyncBadge } from '../components/SyncBadge';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { UpdateBanner } from '../components/UpdateBanner';
import { DrivePage } from '../drive/DrivePage';
import { EditingIndicator } from '../drive/EditingIndicator';
import { CharacterPage } from '../tools/CharacterPage';
import { CharactersPage } from '../tools/CharactersPage';
import { GameSwitcher } from '../tools/common';
import { DefinitionsPage } from '../tools/DefinitionsPage';
import { GroupsPage } from '../tools/GroupsPage';
import { NpcsPage } from '../tools/NpcsPage';
import { PhasesPage } from '../tools/PhasesPage';
import { RelationshipsPage } from '../tools/RelationshipsPage';
import { SchedulePage } from '../tools/SchedulePage';
import { HomePage } from './pages/HomePage';
import { PeoplePage } from './pages/PeoplePage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { TrashPage } from './pages/TrashPage';
import { WorldsPage } from './pages/WorldsPage';
import { usePreview } from './preview';
import { usePreviewControls } from './preview-controls';
import { useTeam, useWorkspace } from './workspace';

interface NavItem extends PaletteItem {
  organizerOnly?: boolean;
  /** NPC pages: for organizers and NPC actors, not players. */
  notForPlayers?: boolean;
}

export function Shell() {
  const { t } = useTranslation();
  const { team, isOrganizer, role } = useTeam();
  const { teams, setTeamId } = useWorkspace();
  const location = useLocation();
  const preview = usePreview();
  const controls = usePreviewControls();

  const general: NavItem[] = [
    { to: '/', label: t('nav.home'), icon: <IconHome size={18} /> },
    { to: '/hledat', label: t('nav.searchPage'), icon: <IconSearch size={18} /> },
    { to: '/disk', label: t('nav.drive'), icon: <IconFolders size={18} /> },
    { to: '/svety', label: t('nav.worlds'), icon: <IconMap2 size={18} /> },
  ];
  const game: NavItem[] = [
    { to: '/postavy', label: t('nav.characters'), icon: <IconUser size={18} /> },
    { to: '/skupiny', label: t('nav.groups'), icon: <IconFlag size={18} /> },
    { to: '/vztahy', label: t('nav.relationships'), icon: <IconHierarchy2 size={18} /> },
    {
      to: '/cp',
      label: t('nav.npcs'),
      icon: <IconMasksTheater size={18} />,
      notForPlayers: true,
    },
    {
      to: '/harmonogram',
      label: t('nav.schedule'),
      icon: <IconCalendarTime size={18} />,
      notForPlayers: true,
    },
    { to: '/faze', label: t('nav.phases'), icon: <IconTimeline size={18} />, organizerOnly: true },
    { to: '/definice', label: t('nav.definitions'), icon: <IconBooks size={18} /> },
  ];
  const teamItems: NavItem[] = [
    { to: '/lide', label: t('nav.people'), icon: <IconUsers size={18} />, organizerOnly: true },
    { to: '/kos', label: t('nav.trash'), icon: <IconTrash size={18} />, organizerOnly: true },
    { to: '/nastaveni', label: t('nav.settings'), icon: <IconSettings size={18} /> },
  ];
  const allowed = (items: NavItem[]) =>
    items.filter(
      (item) => (!item.organizerOnly || isOrganizer) && (!item.notForPlayers || role !== 'player'),
    );
  const link = (item: NavItem) => (
    <NavLink
      key={item.to}
      component={RouterLink}
      to={item.to}
      label={item.label}
      leftSection={item.icon}
      py={6}
      active={item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)}
    />
  );

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
        <ScrollArea h="100%">
          <Stack gap={4}>
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
            {allowed(general).map(link)}
            <Divider my={4} />
            <GameSwitcher />
            {allowed(game).map(link)}
            <Divider my={4} />
            {allowed(teamItems).map(link)}
          </Stack>
        </ScrollArea>
      </AppShell.Navbar>
      <AppShell.Main>
        {preview && (
          <Alert
            color="grape"
            variant="filled"
            mb="md"
            icon={<IconUsersGroup size={18} />}
            data-testid="preview-banner"
          >
            <Group justify="space-between">
              <Text size="sm">
                {t('preview.banner', { name: preview.name, role: t(`roles.${role}`) })}
              </Text>
              <Button size="xs" variant="white" color="grape" onClick={() => controls?.stop()}>
                {t('preview.exit')}
              </Button>
            </Group>
          </Alert>
        )}
        <UpdateBanner />
        <StatusBanner />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/svety" element={<WorldsPage />} />
          <Route path="/svety/:id" element={<WorldsPage />} />
          <Route path="/disk" element={<DrivePage />} />
          <Route path="/hledat" element={<SearchPage />} />
          <Route path="/postavy" element={<CharactersPage />} />
          <Route path="/postavy/:id" element={<CharacterPage />} />
          <Route path="/skupiny" element={<GroupsPage />} />
          <Route path="/skupiny/:id" element={<GroupsPage />} />
          <Route path="/vztahy" element={<RelationshipsPage />} />
          <Route path="/cp" element={<NpcsPage />} />
          <Route path="/cp/:id" element={<NpcsPage />} />
          <Route path="/harmonogram" element={<SchedulePage />} />
          <Route path="/faze" element={<PhasesPage />} />
          <Route path="/definice" element={<DefinitionsPage />} />
          <Route path="/definice/:id" element={<DefinitionsPage />} />
          <Route path="/lide" element={<PeoplePage />} />
          <Route path="/kos" element={<TrashPage />} />
          <Route path="/nastaveni" element={<SettingsPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </AppShell.Main>
      <CommandPalette pages={[...allowed(general), ...allowed(game), ...allowed(teamItems)]} />
    </AppShell>
  );
}
