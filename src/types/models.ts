export type Condition = 'new' | 'good' | 'worn';
export type Priority = 'must-have' | 'nice-to-have' | 'optional';
export type MissingAction = 'buy' | 'borrow' | 'rent';
export type ThemeMode = 'system' | 'light' | 'dark';
export type CreatedBy = 'manual' | 'ai';

export interface PriceValue {
  amount: number;
  currency: string;
}

export interface MaintenanceEntry {
  id: string;
  date: string;
  note: string;
  type?: string;
  cost?: number;
}

export interface WarrantyInfo {
  provider?: string;
  expirationDate?: string;
  notes?: string;
}

export interface GearItem {
  id: string;
  name: string;
  categoryId: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  purchaseDate?: string;
  purchasePrice?: PriceValue;
  currentValue?: PriceValue;
  notes?: string;
  customFields?: Record<string, string>;
  condition: Condition;
  quantity: number;
  photo?: string;
  tags: string[];
  essential: boolean;
  maintenanceHistory?: MaintenanceEntry[];
  warranty?: WarrantyInfo;
  relatedItemIds?: string[];
  createdAt: string;
  updatedAt: string;
  // AI classification fields
  inferredProfile?: 'video_first' | 'photo_first' | 'hybrid' | 'cinema' | 'audio' | 'lighting' | 'support' | 'power' | 'media' | 'accessory';
  capabilities?: string[];
  eventFit?: string[]; // Event types this item is suited for (wedding, corporate, interview, etc.)
  strengths?: string[]; // Practical strengths (low-light, autofocus, portability, etc.)
  classificationStatus?: 'pending' | 'done' | 'failed';
}

export interface Category {
  id: string;
  name: string;
  isDefault: boolean;
  sortOrder: number;
  collapsed?: boolean;
}

export interface PackingChecklistItem {
  id: string;
  eventId: string;
  gearItemId: string | null;
  name: string;
  quantity: number;
  packed: boolean;
  notes?: string;
  categoryName?: string;
  priority?: Priority;
}

export interface MissingItemSuggestion {
  id: string;
  eventId: string;
  name: string;
  reason: string;
  priority: Priority;
  action: MissingAction;
  notes?: string;
  resolvedStatus?: 'unresolved' | 'planned' | 'acquired';
}

export interface EventItem {
  id: string;
  title: string;
  type: string;
  dateTime?: string;
  location?: string;
  client?: string;
  notes?: string;
  packingChecklist: PackingChecklistItem[];
  missingItems: MissingItemSuggestion[];
  createdBy: CreatedBy;
  createdAt: string;
  updatedAt: string;
}

export interface AIFeedback {
  id: string;
  eventType: string;
  itemName: string;
  useful: boolean;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  id: 'app-settings';
  demoDataEnabled: boolean;
  defaultCurrency: string;
  syncEnabled: boolean;
  theme: ThemeMode;
  aiLearningEnabled: boolean;
  displayName?: string;
}

export interface ExportBundle {
  version: 1;
  exportedAt: string;
  data: {
    gearItems: GearItem[];
    categories: Category[];
    events: EventItem[];
    settings: AppSettings[];
    aiFeedback: AIFeedback[];
  };
}
