// TypeScript types for Order It All!

export interface User {
  id: string;
  name: string;
  avatar: string;
  email: string;
  geminiApiKey?: string;
  daily_requests_count?: number;
  last_request_date?: string;
  /** Já passou pelo carrossel de onboarding (`/onboarding`)? Falso por
   *  omissão nos utilizadores antigos — devem vê-lo uma vez na próxima
   *  entrada. */
  onboarded?: boolean;
  /** Número de telemóvel MB WAY — mostrado como atalho ao acertar contas. */
  mbway_phone?: string;
  /** Minúsculas, `[a-z0-9_.]{3,20}` — gerado automaticamente a partir do
   *  nome na primeira configuração de perfil; editável depois no Perfil.
   *  Utilizadores antigos ganham um por migração (`scripts/backfill-usernames.mjs`). */
  username?: string;
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
  /** Quando true, os saldos do grupo são apresentados já simplificados (min-cash-flow). Default true. */
  simplify_debts?: boolean;
  expand?: {
    creator?: User;
    admins?: User[];
    members?: User[];
  };
  created: string;
  updated: string;
}

/** O que `/api/groups/invite/[code]` devolve — só o necessário para o ecrã
 *  de convite (quem não é membro não pode ler o grupo em si). */
export interface InvitePreview {
  groupId: string;
  name: string;
  avatar: string;
  creatorName: string | null;
  memberCount: number;
  /** Só vem a `true` quando o pedido traz sessão e esse utilizador já é membro. */
  isMember: boolean;
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

// --- Livro-razão de despesas (Splitwise-like) ------------------------------

/** Uma "parte" — quem pode dever/receber num grupo: um utilizador com conta
 *  ou um placeholder (membro sem conta, ver `Placeholder`). Todo o cálculo de
 *  saldos usa o id canónico (`claimedBy ?? id`) — ver `src/lib/parties.ts`. */
export interface Party {
  id: string;
  name: string;
  avatar?: string;
  /** Só para `kind === 'user'` — usado na pesquisa do seletor de participantes. */
  email?: string;
  /** Só para `kind === 'user'` — atalho "Copiar número" no acertar contas. */
  mbwayPhone?: string;
  /** Só para `kind === 'user'` — mostrado como "@username" na página da pessoa. */
  username?: string;
  kind: 'user' | 'placeholder';
  /** Só quando `kind === 'placeholder'` e já foi reclamado. */
  claimedBy?: string;
}

/** Membro do grupo sem conta na app (ex.: convidado só pelo link de
 *  divisão). Participa nas despesas como qualquer outra parte; quando a
 *  pessoa entra na app e "reclama" o placeholder, o histórico não é
 *  reescrito — o resolvedor de partes passa a mapear `id → claimed_by`. */
export interface Placeholder {
  id: string;
  group_id: string;
  name: string;
  claimed_by?: string;
  created_by: string;
  expand?: {
    claimed_by?: User;
    created_by?: User;
  };
  created: string;
  updated: string;
}

export type ExpenseKind = 'expense' | 'payment';

export type ExpenseSplitMode =
  | 'equal'
  | 'exact'
  | 'percentage'
  | 'shares'
  | 'adjustment'
  | 'itemized';

/** Quem pagou e quanto (euros). Uma despesa sem pagador (`payers: []`) fica
 *  fora dos saldos — pastilha "Falta pagador" na UI. */
export interface ExpensePayer {
  party: string;
  amount: number;
}

/** Quanto cada parte deve nesta despesa (euros, já arredondado — fonte de
 *  verdade para os saldos). `input` guarda o valor original do modo (%,
 *  quotas, ajuste) para se poder reabrir o formulário e reeditar. */
export interface ExpenseShare {
  party: string;
  amount: number;
  input?: number;
}

export interface Expense {
  id: string;
  /** Ausente/vazio = despesa direta entre amigos, sem grupo (Fase 8) — ver `participants`. */
  group_id?: string;
  kind: ExpenseKind;
  description: string;
  /** Euros, 2 casas — a matemática de saldos corre sempre em cêntimos (ver `src/lib/ledger/money.ts`). */
  amount: number;
  /** Data da despesa (distinta de `created`). */
  date: string;
  category?: string;
  notes?: string;
  split_mode: ExpenseSplitMode;
  payers: ExpensePayer[];
  shares: ExpenseShare[];
  /** Quando `split_mode === 'itemized'` — o split existente com o editor de itens/link/scan. */
  split_id?: string;
  /** Quando lançada a partir do fecho de uma viagem. */
  trip_id?: string;
  /** Ids de utilizadores reais (nunca placeholders) entre `payers`+`shares`.
   *  Sempre preenchido, mesmo em despesas de grupo (aí é redundante com
   *  `group_id.members`) — é o mecanismo de autorização/sync para despesas
   *  sem grupo (ver regra PB e `GLOBAL_FILTERS` em `src/lib/db/sync.ts`). */
  participants?: string[];
  receipt?: string;
  created_by: string;
  updated_by?: string;
  deleted_at?: string;
  deleted_by?: string;
  expand?: {
    created_by?: User;
    updated_by?: User;
    deleted_by?: User;
    split_id?: Split;
    trip_id?: Trip;
    participants?: User[];
  };
  created: string;
  updated: string;
}

/** Comentário numa despesa (Fase 5). `group_id`/`participants` estão
 *  desnormalizados (copiados da despesa ao criar) para a coleção sincronizar
 *  globalmente como `expenses`/`placeholders` (ver `src/lib/db/sync.ts`). */
export interface ExpenseComment {
  id: string;
  expense_id: string;
  /** Ausente/vazio quando a despesa pai é direta (sem grupo) — ver `Expense.group_id`. */
  group_id?: string;
  /** Copiado da despesa pai — ver `Expense.participants`. */
  participants?: string[];
  user: string;
  content: string;
  expand?: {
    user?: User;
  };
  created: string;
  updated: string;
}

// --- Amigos (Fase 8) --------------------------------------------------------

export type FriendshipStatus = 'pending' | 'accepted';

/** Amizade entre dois utilizadores, independente de grupo. `user_a`/`user_b`
 *  guardam sempre o par canónico (`user_a < user_b`, ordem lexicográfica) —
 *  evita pedidos espelhados; `requested_by` diz quem iniciou. Recusar um
 *  pedido pendente é apagar a linha (sem histórico de "recusado"). */
export interface Friendship {
  id: string;
  user_a: string;
  user_b: string;
  status: FriendshipStatus;
  requested_by: string;
  expand?: {
    user_a?: User;
    user_b?: User;
    requested_by?: User;
  };
  created: string;
  updated: string;
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
