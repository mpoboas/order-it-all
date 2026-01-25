import PocketBase from 'pocketbase';
import type { Trip, Order, Item, Split, Group } from './types';

// PocketBase client singleton
const pb = new PocketBase('https://pb-orderit.povoas.top/');

// Disable auto-cancellation for real-time updates
pb.autoCancellation(false);

export { pb };

// Groups API
export const groupsApi = {
    // List all groups the current user is a member of (PocketBase handles the filtering via API rule)
    list: async (): Promise<Group[]> => {
        return await pb.collection('groups').getFullList<Group>({
            sort: '-created',
            expand: 'members'
        });
    },

    getById: async (id: string): Promise<Group> => {
        return await pb.collection('groups').getOne<Group>(id, {
            expand: 'members,admins,creator'
        });
    },

    create: async (data: { name: string; avatar?: File }): Promise<Group> => {
        const formData = new FormData();
        formData.append('name', data.name);
        formData.append('creator', pb.authStore.model?.id || '');
        formData.append('admins', pb.authStore.model?.id || ''); // Creator is automatically admin
        formData.append('members', pb.authStore.model?.id || ''); // Creator is automatically member
        
        // Generate random 6 char invite code
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        formData.append('invite_code', code);
        formData.append('invite_active', 'true');

        if (data.avatar) {
            formData.append('avatar', data.avatar);
        }

        return await pb.collection('groups').create<Group>(formData);
    },

    update: async (id: string, data: Partial<Group> | FormData): Promise<Group> => {
        return await pb.collection('groups').update<Group>(id, data);
    },

    delete: async (id: string): Promise<boolean> => {
        await pb.collection('groups').delete(id);
        return true;
    },

    getByInviteCode: async (code: string): Promise<Group> => {
        return await pb.collection('groups').getFirstListItem<Group>(`invite_code="${code}"`);
    },
    
    join: async (groupId: string, userId: string): Promise<Group> => {
        // We first need the group to get current members
        const group = await pb.collection('groups').getOne<Group>(groupId);
        if (!group.members.includes(userId)) {
             return await pb.collection('groups').update<Group>(groupId, {
                members: [...group.members, userId]
             });
        }
        return group;
    }
};

// Trip API
export const tripsApi = {
  getOpen: async (groupId: string): Promise<Trip[]> => {
    return await pb.collection('trips').getFullList<Trip>({
      filter: `status = "open" && group_id = "${groupId}"`,
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

  getClosed: async (groupId: string): Promise<Trip[]> => {
    return await pb.collection('trips').getFullList<Trip>({
      filter: `status = "closed" && group_id = "${groupId}"`,
      sort: '-updated',
      expand: 'created_by',
    });
  },

  getById: async (id: string): Promise<Trip> => {
    return await pb.collection('trips').getOne<Trip>(id, {
      expand: 'created_by',
    });
  },

  create: async (data: { name: string; description?: string; group_id: string }): Promise<Trip> => {
    return await pb.collection('trips').create<Trip>({
      name: data.name,
      description: data.description || '',
      status: 'open',
      created_by: pb.authStore.model?.id,
      group_id: data.group_id
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

  create: async (data: { trip_id: string; user_name: string; user_id?: string | null }): Promise<Order> => {
    const payload: any = {
      trip_id: data.trip_id,
      user_name: data.user_name,
      can_edit_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };

    // Default to current user if undefined. Pass null to skip.
    if (data.user_id !== null) {
      payload.user = data.user_id || pb.authStore.model?.id;
    }

    return await pb.collection('orders').create<Order>(payload);
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
    found_status?: Item['found_status'];
  }): Promise<Item> => {
    return await pb.collection('items').create<Item>({
      order_id: data.order_id,
      name: data.name,
      quantity: data.quantity,
      brand: data.brand || '',
      notes: data.notes || '',
      found_status: data.found_status || 'pending',
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
  getAll: async (groupId: string): Promise<Split[]> => {
    return await pb.collection('splits').getFullList<Split>({
       filter: `group_id = "${groupId}"`,
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
    group_id: string;
    participants?: string[];
    items?: Split['items'];
  }): Promise<Split> => {
    return await pb.collection('splits').create<Split>({
      name: data.name,
      description: data.description || '',
      created_by: data.created_by,
      group_id: data.group_id,
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
  subscribeToTrips: (arg1: string | ((e: any) => void), arg2?: (e: any) => void) => {
    if (typeof arg1 === 'function') {
        // Legacy: subscribe to all
         return pb.collection('trips').subscribe('*', arg1);
    }
    const groupId = arg1;
    const callback = arg2;
    if (!callback) return Promise.resolve(() => {}); // Should not happen

    return pb.collection('trips').subscribe('*', (e: any) => {
        // Filter manually if needed, or rely on collection-wide subscribe.
        // For strict filtering, we check if the updated record has the correct group ID.
        // PB subscriptions are wide, but we can check the record.
        if (e.record && e.record.group_id === groupId) {
            callback(e);
        }
    });
  },

  subscribeToOrders: (tripId: string, callback: (e: unknown) => void) => {
    return pb.collection('orders').subscribe('*', callback);
  },

  subscribeToItems: (callback: (e: unknown) => void) => {
    return pb.collection('items').subscribe('*', callback);
  },

  subscribeToSplits: (arg1: string | ((e: any) => void), arg2?: (e: any) => void) => {
     if (typeof arg1 === 'function') {
         return pb.collection('splits').subscribe('*', arg1);
     }
     const groupId = arg1;
     const callback = arg2;
     if (!callback) return Promise.resolve(() => {});

     return pb.collection('splits').subscribe('*', (e: any) => {
        if (e.record && e.record.group_id === groupId) {
            callback(e);
        }
    });
  },

  subscribeToGroups: (userId: string, callback: (e: unknown) => void) => {
      // Subscribe to all changes in groups collection
      // For personal list update, we check if user is still in members list or if a new group was created by them.
    return pb.collection('groups').subscribe('*', (e: any) => {
        const record = e.record as Group;
        if (record.members.includes(userId)) {
             callback(e);
        }
    });
  },

  unsubscribeAll: () => {
    pb.collection('trips').unsubscribe();
    pb.collection('orders').unsubscribe();
    pb.collection('items').unsubscribe();
    pb.collection('splits').unsubscribe();
    pb.collection('groups').unsubscribe();
  },
};
