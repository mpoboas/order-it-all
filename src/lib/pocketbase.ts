import PocketBase from 'pocketbase';
import type { Trip, Order, Item, Split, Group, SplitItemMode } from './types';

// PocketBase client singleton
const pb = new PocketBase('https://pb-orderit.povoas.top/');

// Disable auto-cancellation for real-time updates
pb.autoCancellation(false);

export { pb };

// Trip API
export const tripsApi = {
  getOpenByGroup: async (groupId: string): Promise<Trip[]> => {
    return await pb.collection('trips').getFullList<Trip>({
      filter: `group_id = "${groupId}" && status = "open"`,
      sort: '-created',
      expand: 'created_by',
    });
  },

  getAllByGroup: async (groupId: string): Promise<Trip[]> => {
    return await pb.collection('trips').getFullList<Trip>({
      filter: `group_id = "${groupId}"`,
      sort: '-created',
      expand: 'created_by',
    });
  },

  getClosedByGroup: async (groupId: string): Promise<Trip[]> => {
    return await pb.collection('trips').getFullList<Trip>({
      filter: `group_id = "${groupId}" && status = "closed"`,
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
      group_id: data.group_id,
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
      expand: 'user,participants',
    });
  },

  getById: async (id: string): Promise<Order> => {
    return await pb.collection('orders').getOne<Order>(id, {
      expand: 'user,participants',
    });
  },

  create: async (data: {
    trip_id: string;
    user_name: string;
    participantIds: string[];
    createdByUserId?: string;
  }): Promise<Order> => {
    const creatorId = data.createdByUserId ?? pb.authStore.model?.id;
    const payload: Record<string, unknown> = {
      trip_id: data.trip_id,
      user_name: data.user_name,
      participants: data.participantIds,
      can_edit_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };

    if (creatorId) {
      payload.user = creatorId;
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

  getByOrderIds: async (orderIds: string[]): Promise<Item[]> => {
    if (orderIds.length === 0) return [];
    const filter = orderIds.map((id) => `order_id = "${id}"`).join(' || ');
    return await pb.collection('items').getFullList<Item>({
      filter,
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
    unit_price?: number;
    image_url?: string;
    found_status?: Item['found_status'];
  }): Promise<Item> => {
    const qty = data.quantity || 1;
    const unitPrice =
      data.unit_price ??
      (data.price != null && qty > 0 ? data.price / qty : 0);
    return await pb.collection('items').create<Item>({
      order_id: data.order_id,
      name: data.name,
      quantity: qty,
      brand: data.brand || '',
      notes: data.notes || '',
      found_status: data.found_status || 'pending',
      price: data.price ?? unitPrice * qty,
      unit_price: unitPrice,
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

  /** Delete item; remove parent order if it has no items left */
  deleteAndPruneEmptyOrder: async (
    itemId: string,
    orderId: string
  ): Promise<{ orderDeleted: boolean }> => {
    await pb.collection('items').delete(itemId);
    const remaining = await pb.collection('items').getFullList<Item>({
      filter: `order_id = "${orderId}"`,
    });
    if (remaining.length === 0) {
      await pb.collection('orders').delete(orderId);
      return { orderDeleted: true };
    }
    return { orderDeleted: false };
  },

  /** Delete order when it has zero items (e.g. after moving the last product) */
  pruneOrderIfEmpty: async (orderId: string): Promise<boolean> => {
    const remaining = await pb.collection('items').getFullList<Item>({
      filter: `order_id = "${orderId}"`,
    });
    if (remaining.length === 0) {
      await pb.collection('orders').delete(orderId);
      return true;
    }
    return false;
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
  getByGroup: async (groupId: string): Promise<Split[]> => {
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
    group_id: string;
    created_by: string;
    participants?: string[];
    items?: Split['items'];
    allowed_modes?: SplitItemMode[];
  }): Promise<Split> => {
    return await pb.collection('splits').create<Split>({
      name: data.name,
      description: data.description || '',
      group_id: data.group_id,
      status: 'open',
      created_by: data.created_by,
      participants: data.participants || [data.created_by],
      items: data.items || [],
      allowed_modes: data.allowed_modes || [],
    });
  },

  update: async (id: string, data: Partial<Split>): Promise<Split> => {
    return await pb.collection('splits').update<Split>(id, data);
  },

  delete: async (id: string): Promise<boolean> => {
    await pb.collection('splits').delete(id);
    return true;
  },

  getByShareCode: async (code: string): Promise<Split | null> => {
    try {
      return await pb.collection('splits').getFirstListItem<Split>(
        `share_code = "${code}" && share_active = true`
      );
    } catch {
      return null;
    }
  },

  ensureShareCode: async (id: string): Promise<Split> => {
    const split = await pb.collection('splits').getOne<Split>(id);
    if (split.share_code) return split;
    return await pb.collection('splits').update<Split>(id, {
      share_code: generateInviteCode(),
      share_active: split.share_active ?? false,
    });
  },

  toggleShare: async (id: string, active: boolean): Promise<Split> => {
    const split = await splitsApi.ensureShareCode(id);
    return await pb.collection('splits').update<Split>(id, {
      share_active: active,
      share_code: split.share_code,
    });
  },

  regenerateShareCode: async (id: string): Promise<Split> => {
    return await pb.collection('splits').update<Split>(id, {
      share_code: generateInviteCode(),
    });
  },
};

// Helper to generate invite codes
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Group API
export const groupsApi = {
  getByUser: async (userId: string): Promise<Group[]> => {
    return await pb.collection('groups').getFullList<Group>({
      filter: `members ~ "${userId}"`,
      sort: '-created',
      expand: 'creator,members',
    });
  },

  getById: async (id: string): Promise<Group> => {
    return await pb.collection('groups').getOne<Group>(id, {
      expand: 'creator,admins,members',
    });
  },

  getByInviteCode: async (code: string): Promise<Group | null> => {
    try {
      const result = await pb.collection('groups').getFirstListItem<Group>(
        `invite_code = "${code}" && invite_active = true`,
        { expand: 'creator' }
      );
      return result;
    } catch {
      return null;
    }
  },

  create: async (data: { 
    name: string; 
    avatar?: string | Blob;
  }): Promise<Group> => {
    const userId = pb.authStore.model?.id;
    if (!userId) throw new Error('User not authenticated');
    
    // Use FormData to handle file upload
    const formData = new FormData();
    formData.append('name', data.name);
    formData.append('creator', userId);
    formData.append('admins', userId); // For relationship fields, append ID string directly
    formData.append('members', userId);
    formData.append('invite_code', generateInviteCode());
    formData.append('invite_active', 'true');
    
    if (data.avatar instanceof Blob) {
      formData.append('avatar', data.avatar);
    } else if (typeof data.avatar === 'string') {
      // If it's a string, we assume it's an emoji we want to convert to image or just placeholder text? 
      // PocketBase file field might accept text but it won't be an image.
      // However, the caller should have converted emoji to Blob. 
      // If they passed a string, we ignore it for avatar field if it sends validation error, 
      // OR we just assume the API caller handled it. 
      // BUT, if the schema is FILE, a string (emoji) will fail. 
      // So we should NOT append a string to 'avatar' if it's a file field.
      // For now, if string, we do NOTHING (no avatar) or assume the caller handles it.
    }

    return await pb.collection('groups').create<Group>(formData);
  },

  update: async (
    id: string,
    data: { name?: string; avatar?: Blob | File }
  ): Promise<Group> => {
    if (data.avatar) {
      const formData = new FormData();
      if (data.name !== undefined) formData.append('name', data.name);
      formData.append('avatar', data.avatar);
      return await pb.collection('groups').update<Group>(id, formData);
    }
    return await pb.collection('groups').update<Group>(id, {
      ...(data.name !== undefined ? { name: data.name } : {}),
    });
  },

  delete: async (id: string): Promise<boolean> => {
    await pb.collection('groups').delete(id);
    return true;
  },

  addMember: async (groupId: string, userId: string): Promise<Group> => {
    const group = await pb.collection('groups').getOne<Group>(groupId);
    if (group.members.includes(userId)) {
      return group; // Already a member
    }
    return await pb.collection('groups').update<Group>(groupId, {
      members: [...group.members, userId],
    });
  },

  removeMember: async (groupId: string, userId: string): Promise<Group> => {
    const group = await pb.collection('groups').getOne<Group>(groupId);
    // Cannot remove creator
    if (group.creator === userId) {
      throw new Error('Cannot remove the group creator');
    }
    return await pb.collection('groups').update<Group>(groupId, {
      members: group.members.filter(id => id !== userId),
      admins: group.admins.filter(id => id !== userId),
    });
  },

  promoteToAdmin: async (groupId: string, userId: string): Promise<Group> => {
    const group = await pb.collection('groups').getOne<Group>(groupId);
    if (group.admins.includes(userId)) {
      return group; // Already an admin
    }
    return await pb.collection('groups').update<Group>(groupId, {
      admins: [...group.admins, userId],
    });
  },

  demoteFromAdmin: async (groupId: string, userId: string): Promise<Group> => {
    const group = await pb.collection('groups').getOne<Group>(groupId);
    // Cannot demote creator
    if (group.creator === userId) {
      throw new Error('Cannot demote the group creator');
    }
    return await pb.collection('groups').update<Group>(groupId, {
      admins: group.admins.filter(id => id !== userId),
    });
  },

  toggleInvite: async (groupId: string, active: boolean): Promise<Group> => {
    return await pb.collection('groups').update<Group>(groupId, {
      invite_active: active,
    });
  },

  toggleShowAllOrders: async (groupId: string, active: boolean): Promise<Group> => {
    return await pb.collection('groups').update<Group>(groupId, {
      show_all_orders: active,
    });
  },

  regenerateInviteCode: async (groupId: string): Promise<Group> => {
    return await pb.collection('groups').update<Group>(groupId, {
      invite_code: generateInviteCode(),
    });
  },
};

// As subscrições realtime por-página foram substituídas pela cache local-first:
// há uma subscrição partilhada por coleção em src/lib/db/sync.ts que alimenta o
// Dexie, e as páginas lêem via os hooks de src/lib/db/hooks.ts.
