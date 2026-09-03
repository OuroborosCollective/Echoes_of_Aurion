import type { RPGItem } from './types';

declare module './types' {
  interface EquipmentState {
    [slot: string]: RPGItem | null | undefined;
  }
}
