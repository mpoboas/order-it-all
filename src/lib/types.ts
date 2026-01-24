// TypeScript types for Order It All!

export interface User {
  id: string;
  name: string;
  avatar: string;
  email: string;
  geminiApiKey?: string;
}

export interface Trip {
  id: string;
  name: string;
  description: string;
  status: 'open' | 'closed';
  created_by: string;
  expand?: {
    created_by?: User;
  };
  created: string;
  updated: string;
}

export interface Order {
  id: string;
  trip_id: string;
  user: string;
  user_name: string;
  expand?: {
    user?: User;
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
  participants: string[];
  items: SplitItem[];
  created_by: string;
  expand?: {
    created_by?: User;
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
