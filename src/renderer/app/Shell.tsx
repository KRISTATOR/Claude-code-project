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
  IconActivityHeartbeat,
  IconBackpack,
  IconBolt,
  IconBriefcase,
  IconChecklist,
  IconClipboardCheck,
  IconCoin,
  IconId,
  IconMessageCircle,
  IconNotes,
  IconToolsKitchen2,
  IconBed,
  IconBox,
  IconFlask,
  IconMap,
  IconPackage,
  IconTrees,
  IconWalk,
  IconWorld,
  IconArchive,
  IconFiles,
  IconFileText,
  IconForms,
  IconPrinter,
  IconSignRight,
  IconWriting,
  IconBook,
  IconBook2,
  IconBooks,
  IconCalendarTime,
  IconCertificate,
  IconChecks,
  IconClipboardList,
  IconFeather,
  IconHelpCircle,
  IconHourglass,
  IconListDetails,
  IconRoute,
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
import { ArchivePage } from '../documents/ArchivePage';
import { InventoryPage } from '../economy/InventoryPage';
import { ItemsPage } from '../economy/ItemsPage';
import { LootPage } from '../economy/LootPage';
import { RecipesPage } from '../economy/RecipesPage';
import { SleepingPage } from '../economy/SleepingPage';
import { TravelPage } from '../economy/TravelPage';
import { MapsPage } from '../maps/MapsPage';
import { DocumentsPage } from '../documents/DocumentsPage';
import { FormsPage } from '../documents/FormsPage';
import { PrintQueuePage } from '../documents/PrintQueuePage';
import { SignsPage } from '../documents/SignsPage';
import { WritersPage } from '../documents/WritersPage';
import { CanonPage } from '../lore/CanonPage';
import { ConsistencyPage } from '../lore/ConsistencyPage';
import { HistoryPage } from '../lore/HistoryPage';
import { IssuesPage } from '../lore/IssuesPage';
import { PlotsPage } from '../lore/PlotsPage';
import { QuestsPage } from '../lore/QuestsPage';
import { RulesPage } from '../lore/RulesPage';
import { RunOfShowPage } from '../lore/RunOfShowPage';
import { WikiPage } from '../lore/WikiPage';
import { HomePage } from './pages/HomePage';
import { OutboxBadge } from '../components/OutboxBadge';
import { LivePage } from '../live/LivePage';
import { TrackersPage } from '../live/TrackersPage';
import { BudgetPage } from '../logistics/BudgetPage';
import { EquipmentPage } from '../logistics/EquipmentPage';
import { FeedbackPage } from '../logistics/FeedbackPage';
import { FoodPage } from '../logistics/FoodPage';
import { MyRegistrationPage } from '../logistics/MyRegistrationPage';
import { NotesPage } from '../logistics/NotesPage';
import { RegistrationsPage } from '../logistics/RegistrationsPage';
import { TasksPage } from '../logistics/TasksPage';
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
  /** Pages about one's own participation ("Moje přihláška"). */
  notForOrganizers?: boolean;
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
    { to: '/zive', label: t('nav.live'), icon: <IconBolt size={18} />, notForPlayers: true },
    {
      to: '/stav',
      label: t('nav.trackers'),
      icon: <IconActivityHeartbeat size={18} />,
      notForPlayers: true,
    },
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
  const story: NavItem[] = [
    { to: '/encyklopedie', label: t('nav.wiki'), icon: <IconBook size={18} /> },
    { to: '/dejiny', label: t('nav.history'), icon: <IconHourglass size={18} /> },
    { to: '/ukoly', label: t('nav.quests'), icon: <IconClipboardList size={18} /> },
    { to: '/pravidla', label: t('nav.rules'), icon: <IconBook2 size={18} /> },
    { to: '/zapletky', label: t('nav.plots'), icon: <IconRoute size={18} />, organizerOnly: true },
    {
      to: '/prubeh',
      label: t('nav.runOfShow'),
      icon: <IconListDetails size={18} />,
      organizerOnly: true,
    },
    {
      to: '/kanon',
      label: t('nav.canon'),
      icon: <IconCertificate size={18} />,
      organizerOnly: true,
    },
    {
      to: '/problemy',
      label: t('nav.issues'),
      icon: <IconHelpCircle size={18} />,
      organizerOnly: true,
    },
    {
      to: '/kontrola',
      label: t('nav.consistency'),
      icon: <IconChecks size={18} />,
      organizerOnly: true,
    },
  ];
  const gameWorld: NavItem[] = [
    { to: '/mapy', label: t('nav.maps'), icon: <IconMap size={18} /> },
    {
      to: '/predmety',
      label: t('nav.items'),
      icon: <IconPackage size={18} />,
      organizerOnly: true,
    },
    { to: '/recepty', label: t('nav.recipes'), icon: <IconFlask size={18} />, organizerOnly: true },
    { to: '/nalezy', label: t('nav.loot'), icon: <IconTrees size={18} />, organizerOnly: true },
    { to: '/cesty', label: t('nav.travel'), icon: <IconWalk size={18} />, organizerOnly: true },
    { to: '/spani', label: t('nav.sleeping'), icon: <IconBed size={18} />, organizerOnly: true },
  ];
  const printing: NavItem[] = [
    {
      to: '/dokumenty',
      label: t('nav.documents'),
      icon: <IconFileText size={18} />,
      organizerOnly: true,
    },
    {
      to: '/pisatele',
      label: t('nav.writers'),
      icon: <IconWriting size={18} />,
      organizerOnly: true,
    },
    { to: '/formulare', label: t('nav.forms'), icon: <IconForms size={18} />, organizerOnly: true },
    {
      to: '/cedule',
      label: t('nav.signs'),
      icon: <IconSignRight size={18} />,
      organizerOnly: true,
    },
    {
      to: '/archiv',
      label: t('nav.archive'),
      icon: <IconArchive size={18} />,
      organizerOnly: true,
    },
    {
      to: '/tisk',
      label: t('nav.printQueue'),
      icon: <IconPrinter size={18} />,
      organizerOnly: true,
    },
  ];
  const logistics: NavItem[] = [
    {
      to: '/moje-prihlaska',
      label: t('nav.myRegistration'),
      icon: <IconId size={18} />,
      notForOrganizers: true,
    },
    {
      to: '/prihlasky',
      label: t('nav.registrations'),
      icon: <IconClipboardCheck size={18} />,
      organizerOnly: true,
    },
    {
      to: '/jidlo',
      label: t('nav.food'),
      icon: <IconToolsKitchen2 size={18} />,
      organizerOnly: true,
    },
    { to: '/rozpocet', label: t('nav.budget'), icon: <IconCoin size={18} />, organizerOnly: true },
    { to: '/vybaveni', label: t('nav.equipment'), icon: <IconBackpack size={18} /> },
    {
      to: '/ukolnicek',
      label: t('nav.tasks'),
      icon: <IconChecklist size={18} />,
      organizerOnly: true,
    },
    { to: '/poznamky', label: t('nav.notes'), icon: <IconNotes size={18} />, organizerOnly: true },
    {
      to: '/zpetna-vazba',
      label: t('nav.feedback'),
      icon: <IconMessageCircle size={18} />,
      organizerOnly: true,
    },
  ];
  const teamItems: NavItem[] = [
    { to: '/lide', label: t('nav.people'), icon: <IconUsers size={18} />, organizerOnly: true },
    { to: '/sklad', label: t('nav.inventory'), icon: <IconBox size={18} />, organizerOnly: true },
    { to: '/kos', label: t('nav.trash'), icon: <IconTrash size={18} />, organizerOnly: true },
    { to: '/nastaveni', label: t('nav.settings'), icon: <IconSettings size={18} /> },
  ];
  const allowed = (items: NavItem[]) =>
    items.filter(
      (item) =>
        (!item.organizerOnly || isOrganizer) &&
        (!item.notForPlayers || role !== 'player') &&
        (!item.notForOrganizers || role !== 'organizer'),
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
            <OutboxBadge />
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
            <NavLink
              label={t('nav.story')}
              leftSection={<IconFeather size={18} />}
              py={6}
              defaultOpened={story.some((item) => location.pathname.startsWith(item.to))}
              childrenOffset={12}
              data-testid="nav-story"
            >
              {allowed(story).map(link)}
            </NavLink>
            <NavLink
              label={t('nav.gameWorld')}
              leftSection={<IconWorld size={18} />}
              py={6}
              defaultOpened={gameWorld.some((item) => location.pathname.startsWith(item.to))}
              childrenOffset={12}
              data-testid="nav-world"
            >
              {allowed(gameWorld).map(link)}
            </NavLink>
            {isOrganizer && (
              <NavLink
                label={t('nav.printing')}
                leftSection={<IconFiles size={18} />}
                py={6}
                defaultOpened={printing.some((item) => location.pathname.startsWith(item.to))}
                childrenOffset={12}
                data-testid="nav-printing"
              >
                {allowed(printing).map(link)}
              </NavLink>
            )}
            <NavLink
              label={t('nav.logistics')}
              leftSection={<IconBriefcase size={18} />}
              py={6}
              defaultOpened={logistics.some((item) => location.pathname.startsWith(item.to))}
              childrenOffset={12}
              data-testid="nav-logistics"
            >
              {allowed(logistics).map(link)}
            </NavLink>
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
          <Route path="/encyklopedie" element={<WikiPage />} />
          <Route path="/encyklopedie/:id" element={<WikiPage />} />
          <Route path="/dejiny" element={<HistoryPage />} />
          <Route path="/ukoly" element={<QuestsPage />} />
          <Route path="/pravidla" element={<RulesPage />} />
          <Route path="/zapletky" element={<PlotsPage />} />
          <Route path="/zapletky/:id" element={<PlotsPage />} />
          <Route path="/prubeh" element={<RunOfShowPage />} />
          <Route path="/kanon" element={<CanonPage />} />
          <Route path="/problemy" element={<IssuesPage />} />
          <Route path="/kontrola" element={<ConsistencyPage />} />
          <Route path="/dokumenty" element={<DocumentsPage />} />
          <Route path="/dokumenty/:id" element={<DocumentsPage />} />
          <Route path="/pisatele" element={<WritersPage />} />
          <Route path="/pisatele/:id" element={<WritersPage />} />
          <Route path="/formulare" element={<FormsPage />} />
          <Route path="/formulare/:id" element={<FormsPage />} />
          <Route path="/cedule" element={<SignsPage />} />
          <Route path="/archiv" element={<ArchivePage />} />
          <Route path="/tisk" element={<PrintQueuePage />} />
          <Route path="/mapy" element={<MapsPage />} />
          <Route path="/mapy/:id" element={<MapsPage />} />
          <Route path="/predmety" element={<ItemsPage />} />
          <Route path="/recepty" element={<RecipesPage />} />
          <Route path="/nalezy" element={<LootPage />} />
          <Route path="/cesty" element={<TravelPage />} />
          <Route path="/spani" element={<SleepingPage />} />
          <Route path="/sklad" element={<InventoryPage />} />
          <Route path="/zive" element={<LivePage />} />
          <Route path="/stav" element={<TrackersPage />} />
          <Route path="/prihlasky" element={<RegistrationsPage />} />
          <Route path="/moje-prihlaska" element={<MyRegistrationPage />} />
          <Route path="/jidlo" element={<FoodPage />} />
          <Route path="/rozpocet" element={<BudgetPage />} />
          <Route path="/vybaveni" element={<EquipmentPage />} />
          <Route path="/ukolnicek" element={<TasksPage />} />
          <Route path="/poznamky" element={<NotesPage />} />
          <Route path="/poznamky/:id" element={<NotesPage />} />
          <Route path="/zpetna-vazba" element={<FeedbackPage />} />
          <Route path="/zpetna-vazba/:id" element={<FeedbackPage />} />
          <Route path="/lide" element={<PeoplePage />} />
          <Route path="/kos" element={<TrashPage />} />
          <Route path="/nastaveni" element={<SettingsPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </AppShell.Main>
      <CommandPalette
        pages={[
          ...allowed(general),
          ...allowed(game),
          ...allowed(story),
          ...allowed(gameWorld),
          ...allowed(printing),
          ...allowed(teamItems),
        ]}
      />
    </AppShell>
  );
}
