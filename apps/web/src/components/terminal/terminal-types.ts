export interface QuickActionItem {
  id: string;
  label: string;
  icon?: string;
  category?: string;
}

export const EMPTY_QUICK_ACTIONS: QuickActionItem[] = [];
