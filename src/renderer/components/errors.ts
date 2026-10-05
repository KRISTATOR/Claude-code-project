import type { TFunction } from 'i18next';
import { classifyError } from '../data/remote';

/** A Czech message for any error coming back from the server. */
export function errorMessage(t: TFunction, error: unknown): string {
  const classified = classifyError(error);
  switch (classified.kind) {
    case 'offline':
      return t('errors.offline');
    case 'paused':
      return t('errors.paused');
    case 'denied':
      return t('errors.denied');
    case 'conflict':
      return t('errors.conflict');
    case 'auth':
      return t('errors.auth');
    default:
      return t('errors.generic', { message: classified.message });
  }
}
