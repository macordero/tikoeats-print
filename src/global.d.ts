import type { TikoBridge } from '../electron/preload';

declare global {
  interface Window {
    tiko: TikoBridge;
  }
}
export {};
