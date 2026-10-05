import { createContext, useContext } from 'react';

/** Starting and ending "Zobrazit jako hráč" (organizers only). */
export interface PreviewControls {
  /** Opens `path` (a hash route, default the home page) as that person. */
  start(personId: string, path?: string): Promise<void>;
  stop(): void;
}

export const PreviewControlsContext = createContext<PreviewControls | null>(null);

export function usePreviewControls(): PreviewControls | null {
  return useContext(PreviewControlsContext);
}
