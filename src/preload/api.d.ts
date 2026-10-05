import type { ZazemiApi } from '../shared/api';

declare global {
  interface Window {
    zazemi: ZazemiApi;
  }
}

export {};
