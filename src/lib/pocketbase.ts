import PocketBase from 'pocketbase';
import type { Trip, Order, Item, Split } from './types';

// PocketBase client singleton
const pb = new PocketBase('https://pb-orderit.povoas.top/');

// Disable auto-cancellation for real-time updates
pb.autoCancellation(false);

export { pb };

// Trip API
export const tripsApi = {
  getOpen: async (): Promise<Trip[]> => {
    return await pb.collection('trips').getFullList<Trip>({
      filter: 'status = "open"',
      sort: '-created',
      expand: 'created_by',
    });
  },

  getAll: async (): Promise<Trip[]> => {
    return await pb.collection('trips').getFullList<Trip>({
      sort: '-created',
      expand: 'created_by',
    });
  },

  getClosed: async (): Promise<Trip[]> => {
    return await pb.collection('trips').getFullList<Trip>({
      filter: 'status = "closed"',
      sort: '-updated',
      expand: 'created_by',
    });
  },

  getById: async (id: string): Promise<Trip> => {
    return await pb.collection('trips').getOne<Trip>(id, {
      expand: 'created_by',
    });
  },

  create: async (data: { name: string; description?: string }): Promise<Trip> => {
    return await pb.collection('trips').create<Trip>({
      name: data.name,
      description: data.description || '',
      status: 'open',
      created_by: pb.authStore.model?.id,
    });
  },

  update: async (id: string, data: Partial<Trip>): Promise<Trip> => {
    return await pb.collection('trips').update<Trip>(id, data);
  },

  delete: async (id: string): Promise<boolean> => {
    await pb.collection('trips').delete(id);
    return true;
  },

  close: async (id: string): Promise<Trip> => {
    return await pb.collection('trips').update<Trip>(id, { status: 'closed' });
  },
};

// Order API
export const ordersApi = {
  getByTrip: async (tripId: string): Promise<Order[]> => {
    return await pb.collection('orders').getFullList<Order>({
      filter: `trip_id = "${tripId}"`,
      sort: '-created',
      expand: 'user',
    });
  },

  getById: async (id: string): Promise<Order> => {
    return await pb.collection('orders').getOne<Order>(id, {
      expand: 'user',
    });
  },

  create: async (data: { trip_id: string; user_name: string }): Promise<Order> => {
    return await pb.collection('orders').create<Order>({
      trip_id: data.trip_id,
      user_name: data.user_name,
      user: pb.authStore.model?.id,
      can_edit_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
  },

  update: async (id: string, data: Partial<Order>): Promise<Order> => {
    return await pb.collection('orders').update<Order>(id, data);
  },

  delete: async (id: string): Promise<boolean> => {
    await pb.collection('orders').delete(id);
    return true;
  },
};

// Item API
export const itemsApi = {
  getByOrder: async (orderId: string): Promise<Item[]> => {
    return await pb.collection('items').getFullList<Item>({
      filter: `order_id = "${orderId}"`,
      sort: 'created',
    });
  },

  getById: async (id: string): Promise<Item> => {
    return await pb.collection('items').getOne<Item>(id);
  },

  create: async (data: {
    order_id: string;
    name: string;
    quantity: number;
    brand?: string;
    notes?: string;
    price?: number;
    image_url?: string;
  }): Promise<Item> => {
    return await pb.collection('items').create<Item>({
      order_id: data.order_id,
      name: data.name,
      quantity: data.quantity,
      brand: data.brand || '',
      notes: data.notes || '',
      found_status: 'pending',
      price: data.price || 0,
      image_url: data.image_url || '',
    });
  },

  update: async (id: string, data: Partial<Item>): Promise<Item> => {
    return await pb.collection('items').update<Item>(id, data);
  },

  delete: async (id: string): Promise<boolean> => {
    await pb.collection('items').delete(id);
    return true;
  },

  updateStatus: async (id: string, status: Item['found_status']): Promise<Item> => {
    return await pb.collection('items').update<Item>(id, { found_status: status });
  },

  updatePrice: async (id: string, price: number): Promise<Item> => {
    return await pb.collection('items').update<Item>(id, { price });
  },
};

// User API
export const usersApi = {
  authWithPassword: async (email: string, password: string) => {
    return await pb.collection('users').authWithPassword(email, password);
  },

  create: async (data: any) => {
    return await pb.collection('users').create(data);
  },

  authRefresh: async () => {
    return await pb.collection('users').authRefresh();
  },

  update: async (id: string, data: any) => {
    return await pb.collection('users').update(id, data);
  },
  
  logout: () => {
    pb.authStore.clear();
  }
};

// Split API
export const splitsApi = {
  getAll: async (): Promise<Split[]> => {
    return await pb.collection('splits').getFullList<Split>({
      sort: '-created',
      expand: 'created_by',
    });
  },

  getById: async (id: string): Promise<Split> => {
    return await pb.collection('splits').getOne<Split>(id);
  },

  create: async (data: {
    name: string;
    description?: string;
    created_by: string;
    participants?: string[];
    items?: Split['items'];
  }): Promise<Split> => {
    return await pb.collection('splits').create<Split>({
      name: data.name,
      description: data.description || '',
      created_by: data.created_by,
      participants: data.participants || [data.created_by],
      items: data.items || [],
    });
  },

  update: async (id: string, data: Partial<Split>): Promise<Split> => {
    return await pb.collection('splits').update<Split>(id, data);
  },

  delete: async (id: string): Promise<boolean> => {
    await pb.collection('splits').delete(id);
    return true;
  },
};

// Real-time subscriptions
export const subscriptions = {
  subscribeToTrips: (callback: (e: unknown) => void) => {
    return pb.collection('trips').subscribe('*', callback);
  },

  subscribeToOrders: (tripId: string, callback: (e: unknown) => void) => {
    return pb.collection('orders').subscribe('*', callback);
  },

  subscribeToItems: (callback: (e: unknown) => void) => {
    return pb.collection('items').subscribe('*', callback);
  },

  subscribeToSplits: (callback: (e: unknown) => void) => {
    return pb.collection('splits').subscribe('*', callback);
  },

  unsubscribeAll: () => {
    pb.collection('trips').unsubscribe();
    pb.collection('orders').unsubscribe();
    pb.collection('items').unsubscribe();
    pb.collection('splits').unsubscribe();
  },
};
