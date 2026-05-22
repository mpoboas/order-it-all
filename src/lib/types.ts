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

export interface SplitwiseMemberCache {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  displayName: string;
}

/** 1:1 Splitwise config per Order It All group (collection `group_splitwise`) */
export interface GroupSplitwise {
  id: string;
  group_id: string;
  access_token?: string;
  connected_user_id?: number;
  splitwise_group_id?: number;
  splitwise_group_name?: string;
  members_cache?: SplitwiseMemberCache[];
  name_map?: Record<string, number>;
  created: string;
  updated: string;
}

/** Safe subset returned to the browser (no access_token) */
export type GroupSplitwisePublic = Omit<GroupSplitwise, 'access_token'> & {
  connected: boolean;
};

export interface Group {
  id: string;
  name: string;
  avatar: string; // File path or emoji
  creator: string; // User ID
  admins: string[]; // User IDs (includes creator)
  members: string[]; // User IDs (all members including admins)
  invite_code: string;
  invite_active: boolean;
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

export interface Split {
  id: string;
  name: string;
  description: string;
  group_id: string;
  participants: string[];
  items: SplitItem[];
  share_code?: string;
  share_active?: boolean;
  splitwise_participant_map?: Record<string, number>;
  splitwise_exported_at?: string;
  splitwise_expense_id?: number;
  created_by: string;
  expand?: {
    created_by?: User;
    group_id?: Group;
  };
  created: string;
  updated: string;
}

export interface SplitItem {
  name: string;
  price: number;
  participants: string[];
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
