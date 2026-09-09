// TypeScript types for Order It All!

export interface User {
  id: string;
  name: string;
  avatar: string;
  email: string;
  geminiApiKey?: string;
  daily_requests_count?: number;
  last_request_date?: string;
}

export interface Group {
  id: string;
  name: string;
  avatar: string; // File path or emoji
  creator: string; // User ID
  admins: string[]; // User IDs (includes creator)
  members: string[]; // User IDs (all members including admins)
  invite_code: string;
  invite_active: boolean;
  /** Admin setting: when true, members can see every order in the group's trips, not just their own. */
  show_all_orders?: boolean;
  expand?: {
    creator?: User;
    admins?: User[];
    members?: User[];
  };
  created: string;
  updated: string;
}

export interface Trip {
  id: string;
  name: string;
  description: string;
  group_id: string;
  status: 'open' | 'in_progress' | 'closed';
  created_by: string;
  expand?: {
    created_by?: User;
    group_id?: Group;
  };
  created: string;
  updated: string;
}

export interface Order {
  id: string;
  trip_id: string;
  user: string;
  user_name: string;
  participants: string[];
  expand?: {
    user?: User;
    participants?: User[];
  };
  can_edit_until: string;
  created: string;
  updated: string;
}

export interface Item {
  id: string;
  order_id: string;
  name: string;
  quantity: number;
  brand: string;
  notes: string;
  found_status: 'pending' | 'found' | 'not_available';
  price: number;
  unit_price: number;
  image_url: string;
  created: string;
  updated: string;
}

export interface OrderWithItems extends Order {
  items: Item[];
}

export type SplitStatus = 'open' | 'closed';

export interface Split {
  id: string;
  name: string;
  description: string;
  group_id: string;
  status?: SplitStatus;
  participants: string[];
  items: SplitItem[];
  share_code?: string;
  share_active?: boolean;
  /** Which split-item modes members are allowed to pick. Empty/undefined = all allowed. */
  allowed_modes?: SplitItemMode[];
  /** Monotónico — bumped a cada escrita de `items`. Controlo de concorrência
   *  optimista para os toques concorrentes dos participantes (ver rota share). */
  items_version?: number;
  created_by: string;
  expand?: {
    created_by?: User;
    group_id?: Group;
  };
  created: string;
  updated: string;
}

export type SplitItemMode = 'equal' | 'unequal' | 'percentage' | 'shares';

export interface SplitItem {
  name: string;
  price: number;
  participants: string[];
  /** When true, non-admins cannot remove themselves from this item. */
  locked?: boolean;
  /** How this item is split among participants. Defaults to equal. */
  split_mode?: SplitItemMode;
  /** Per-participant values: euros (unequal), percent (percentage), or shares (shares). */
  allocations?: Record<string, number>;
}

// Form types
export interface OrderFormData {
  user_name: string;
  items: ItemFormData[];
}

export interface ItemFormData {
  name: string;
  quantity: number;
  brand?: string;
  notes?: string;
}

export interface TripFormData {
  name: string;
  description?: string;
}
