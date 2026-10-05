import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useBackend } from '../app/backend';
import { useTeam, useWorkspace } from '../app/workspace';
import { errorMessage } from '../components/errors';
import { notifyError, notifySuccess } from '../components/notify';
import { FilesService } from '../data/files';
import { SupabaseStorageProvider } from '../data/storage';
import { OfficeController, type EditSession } from './office-controller';
import { pdfText } from './pdf';

interface Drive {
  files: FilesService;
  office: OfficeController;
}

const DriveContext = createContext<Drive | null>(null);

export function DriveProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { client, info } = useBackend();
  const { cache } = useWorkspace();
  const { repo, team } = useTeam();

  const value = useMemo<Drive>(() => {
    const files = new FilesService(
      client,
      cache,
      repo,
      team.id,
      new SupabaseStorageProvider(client),
      pdfText,
    );
    const office = new OfficeController(files, cache, info.machine, {
      saved: (name, conflict) =>
        conflict
          ? notifyError(t('editing.conflictNotice', { name }))
          : notifySuccess(t('editing.savedNotice', { name })),
      lost: (name) => notifyError(t('editing.lostNotice', { name })),
      error: (name, error) =>
        notifyError(t('editing.errorNotice', { name, message: errorMessage(t, error) })),
      finished: (name) => notifySuccess(t('editing.finishedNotice', { name })),
    });
    return { files, office };
  }, [client, cache, repo, team.id, info.machine, t]);

  useEffect(() => {
    void value.office.start();
    return () => value.office.stop();
  }, [value]);

  return <DriveContext.Provider value={value}>{children}</DriveContext.Provider>;
}

export function useDrive(): Drive {
  const value = useContext(DriveContext);
  if (!value) throw new Error('useDrive outside DriveProvider');
  return value;
}

export function useEditSessions(): EditSession[] {
  const { office } = useDrive();
  return useSyncExternalStore(office.subscribe, office.getSnapshot);
}
