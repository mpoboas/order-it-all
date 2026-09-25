import PocketBase from 'pocketbase';
import type { Trip, Order, Item, Split, Group, InvitePreview, SplitItemMode, Expense, ExpenseKind, ExpenseSplitMode, ExpensePayer, ExpenseShare, Placeholder, ExpenseComment, Friendship } from './types';

// PocketBase client singleton
const pb = new PocketBase(
  process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top/'
);

// Disable auto-cancellation for real-time updates
pb.autoCancellation(false);

export { pb };

/** Cabeçalhos para as rotas `/api/*` que exigem sessão — o servidor valida o
 *  token junto do PocketBase (`src/lib/serverAuth.ts`). */
export function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: pb.authStore.token,
  };
}

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

    // Pede o `expand` já na resposta — o card do pedido acabado de criar aparece
    // completo no Dexie sem esperar o eco do realtime.
    return await pb.collection('orders').create<Order>(payload, {
      expand: 'user,participants',
    });
  },

  update: async (id: string, data: Partial<Order>): Promise<Order> => {
    return await pb.collection('orders').update<Order>(id, data, {
      expand: 'user,participants',
    });
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

  /**
   * Escrita que toca em `items` com controlo de concorrência optimista.
   * `items_version` tem de ficar > ao guardado (regra de API do PB) — se outra
   * pessoa (ex.: um participante no link) escreveu entretanto, o PB devolve
   * 404/403 e o chamador relê + volta a tentar. `data` pode trazer outros
   * campos (`participants`, `name`, …) que vão no mesmo update.
   */
  updateItems: async (
    id: string,
    data: Partial<Split> & { items: Split['items'] },
    expectedVersion: number
  ): Promise<Split> => {
    return await pb.collection('splits').update<Split>(id, {
      ...data,
      items_version: (expectedVersion || 0) + 1,
    });
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

// Expense API — livro-razão (despesas + pagamentos, ver src/lib/ledger/*)
export const expensesApi = {
  /** Para os links antigos de `/groups/[g]/splits/[s]` — encontra a despesa
   *  ligada a um split (Fase 2 do livro-razão: um split é sempre editor de
   *  itens de uma despesa itemizada). `null` se nenhuma despesa a referenciar. */
  getBySplitId: async (splitId: string): Promise<Expense | null> => {
    try {
      return await pb.collection('expenses').getFirstListItem<Expense>(`split_id = "${splitId}"`);
    } catch {
      return null;
    }
  },

  getByGroups: async (groupIds: string[]): Promise<Expense[]> => {
    if (groupIds.length === 0) return [];
    const filter = groupIds.map((id) => `group_id = "${id}"`).join(' || ');
    return await pb.collection('expenses').getFullList<Expense>({
      filter,
      sort: '-date,-created',
      expand: 'created_by,updated_by,deleted_by,participants',
    });
  },

  /** Despesas diretas (sem grupo) entre o utilizador e um amigo — Fase 8. */
  getDirectBetween: async (userIdA: string, userIdB: string): Promise<Expense[]> => {
    return await pb.collection('expenses').getFullList<Expense>({
      filter: `group_id = "" && participants ~ "${userIdA}" && participants ~ "${userIdB}"`,
      sort: '-date,-created',
      expand: 'created_by,updated_by,deleted_by,participants',
    });
  },

  getById: async (id: string): Promise<Expense> => {
    return await pb.collection('expenses').getOne<Expense>(id, {
      expand: 'created_by,updated_by,deleted_by,split_id,trip_id,participants',
    });
  },

  create: async (data: {
    /** Omitido/vazio = despesa direta entre amigos (Fase 8) — ver `participants`. */
    group_id?: string;
    kind?: ExpenseKind;
    description: string;
    amount: number;
    date: string;
    category?: string;
    notes?: string;
    split_mode: ExpenseSplitMode;
    payers: ExpensePayer[];
    shares: ExpenseShare[];
    split_id?: string;
    trip_id?: string;
    /** Ids de utilizadores reais entre `payers`+`shares` — obrigatório quando
     *  não há `group_id` (é o mecanismo de autorização da despesa direta). */
    participants?: string[];
    created_by: string;
  }): Promise<Expense> => {
    return await pb.collection('expenses').create<Expense>({
      kind: 'expense',
      notes: '',
      ...data,
      updated_by: data.created_by,
    });
  },

  update: async (
    id: string,
    data: Partial<Expense>,
    updatedByUserId: string
  ): Promise<Expense> => {
    return await pb.collection('expenses').update<Expense>(id, {
      ...data,
      updated_by: updatedByUserId,
    });
  },

  /** Soft-delete — mantém-se em "Apagadas recentemente" com restauro. */
  softDelete: async (id: string, deletedByUserId: string): Promise<Expense> => {
    return await pb.collection('expenses').update<Expense>(id, {
      deleted_at: new Date().toISOString(),
      deleted_by: deletedByUserId,
    });
  },

  restore: async (id: string): Promise<Expense> => {
    return await pb.collection('expenses').update<Expense>(id, {
      deleted_at: null,
      deleted_by: null,
    });
  },

  /** Anexa/substitui a foto do recibo (Fase 6). */
  uploadReceipt: async (id: string, file: Blob, updatedByUserId: string): Promise<Expense> => {
    const formData = new FormData();
    formData.append('receipt', file);
    formData.append('updated_by', updatedByUserId);
    return await pb.collection('expenses').update<Expense>(id, formData);
  },

  removeReceipt: async (id: string, updatedByUserId: string): Promise<Expense> => {
    return await pb.collection('expenses').update<Expense>(id, {
      receipt: null,
      updated_by: updatedByUserId,
    });
  },
};

// Placeholder API — membros de grupo sem conta na app
export const placeholdersApi = {
  getByGroups: async (groupIds: string[]): Promise<Placeholder[]> => {
    if (groupIds.length === 0) return [];
    const filter = groupIds.map((id) => `group_id = "${id}"`).join(' || ');
    return await pb.collection('placeholders').getFullList<Placeholder>({
      filter,
      sort: '-created',
      expand: 'claimed_by,created_by',
    });
  },

  create: async (data: {
    group_id: string;
    name: string;
    created_by: string;
  }): Promise<Placeholder> => {
    return await pb.collection('placeholders').create<Placeholder>(data);
  },

  rename: async (id: string, name: string): Promise<Placeholder> => {
    return await pb.collection('placeholders').update<Placeholder>(id, { name });
  },

  /** Associa o placeholder a um utilizador com conta — o histórico não é
   *  reescrito, só se marca `claimed_by` (ver `src/lib/parties.ts`). */
  claim: async (id: string, userId: string): Promise<Placeholder> => {
    return await pb.collection('placeholders').update<Placeholder>(id, {
      claimed_by: userId,
    });
  },

  delete: async (id: string): Promise<boolean> => {
    await pb.collection('placeholders').delete(id);
    return true;
  },
};

// Friendship API — amizade entre dois utilizadores, independente de grupo (Fase 8)
export const friendshipsApi = {
  getForUser: async (userId: string): Promise<Friendship[]> => {
    return await pb.collection('friendships').getFullList<Friendship>({
      filter: `user_a = "${userId}" || user_b = "${userId}"`,
      expand: 'user_a,user_b,requested_by',
    });
  },

  /** Pede amizade a `otherUserId`. O par canónico (`user_a < user_b`,
   *  exigido pela regra de criação) é resolvido aqui. */
  request: async (currentUserId: string, otherUserId: string): Promise<Friendship> => {
    const [user_a, user_b] = [currentUserId, otherUserId].sort();
    return await pb.collection('friendships').create<Friendship>({
      user_a,
      user_b,
      status: 'pending',
      requested_by: currentUserId,
    });
  },

  /** Só quem não pediu pode aceitar (ver regra da coleção). */
  accept: async (id: string): Promise<Friendship> => {
    return await pb.collection('friendships').update<Friendship>(id, { status: 'accepted' });
  },

  /** Cancela um pedido pendente ou desfaz uma amizade aceite — sem histórico. */
  remove: async (id: string): Promise<boolean> => {
    await pb.collection('friendships').delete(id);
    return true;
  },
};

// Comentários numa despesa (Fase 5)
export const commentsApi = {
  getByExpense: async (expenseId: string): Promise<ExpenseComment[]> => {
    return await pb.collection('expense_comments').getFullList<ExpenseComment>({
      filter: `expense_id = "${expenseId}"`,
      sort: 'created',
      expand: 'user',
    });
  },

  create: async (data: {
    expense_id: string;
    /** Omitido/vazio quando a despesa pai é direta (sem grupo) — ver `Expense.group_id`. */
    group_id?: string;
    /** Copiado da despesa pai (`Expense.participants`) — necessário para a
     *  regra de acesso quando a despesa não tem grupo. */
    participants?: string[];
    user: string;
    content: string;
  }): Promise<ExpenseComment> => {
    return await pb.collection('expense_comments').create<ExpenseComment>(data);
  },

  delete: async (id: string): Promise<boolean> => {
    await pb.collection('expense_comments').delete(id);
    return true;
  },
};

// Códigos de convite/partilha — são credenciais (quem tem o código entra no
// grupo / mexe na divisão), por isso CSPRNG e não `Math.random`. Rejeição de
// bytes ≥ 220 (4×55) para não enviesar a distribuição.
const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const INVITE_LENGTH = 10;

function generateInviteCode(): string {
  const limit = 256 - (256 % INVITE_CHARS.length);
  let code = '';
  while (code.length < INVITE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(INVITE_LENGTH * 2))) {
      if (byte < limit && code.length < INVITE_LENGTH) {
        code += INVITE_CHARS[byte % INVITE_CHARS.length];
      }
    }
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

  /** Pré-visualização de um convite. Quem ainda não é membro não tem acesso
   *  de leitura a `groups`, por isso passa pela rota de servidor, que valida o
   *  código e devolve só o mínimo para o ecrã de convite. */
  previewInvite: async (code: string): Promise<InvitePreview | null> => {
    const res = await fetch(`/api/groups/invite/${encodeURIComponent(code)}`, {
      headers: pb.authStore.isValid ? authHeaders() : {},
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`invite preview failed: ${res.status}`);
    return (await res.json()) as InvitePreview;
  },

  /** Entra no grupo do convite (a rota valida o código e acrescenta o
   *  utilizador de forma atómica). Devolve o id do grupo. */
  joinByInvite: async (code: string): Promise<string> => {
    const res = await fetch(`/api/groups/invite/${encodeURIComponent(code)}`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = (await res.json().catch(() => ({}))) as { groupId?: string; error?: string };
    if (!res.ok || !data.groupId) throw new Error(data.error || `join failed: ${res.status}`);
    return data.groupId;
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

  // `members-`/`admins+`/… são os modificadores atómicos do PocketBase — em
  // vez de ler o array, alterá-lo e reescrevê-lo inteiro (duas alterações em
  // simultâneo perdiam uma delas).
  removeMember: async (groupId: string, userId: string): Promise<Group> => {
    const group = await pb.collection('groups').getOne<Group>(groupId);
    // Cannot remove creator
    if (group.creator === userId) {
      throw new Error('Cannot remove the group creator');
    }
    return await pb.collection('groups').update<Group>(groupId, {
      'members-': userId,
      'admins-': userId,
    });
  },

  promoteToAdmin: async (groupId: string, userId: string): Promise<Group> => {
    return await pb.collection('groups').update<Group>(groupId, {
      'admins+': userId,
    });
  },

  demoteFromAdmin: async (groupId: string, userId: string): Promise<Group> => {
    const group = await pb.collection('groups').getOne<Group>(groupId);
    // Cannot demote creator
    if (group.creator === userId) {
      throw new Error('Cannot demote the group creator');
    }
    return await pb.collection('groups').update<Group>(groupId, {
      'admins-': userId,
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

  toggleSimplifyDebts: async (groupId: string, active: boolean): Promise<Group> => {
    return await pb.collection('groups').update<Group>(groupId, {
      simplify_debts: active,
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
