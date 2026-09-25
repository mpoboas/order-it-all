// Migração PocketBase — fecha as coleções anteriores ao livro-razão
// (`groups`, `trips`, `orders`, `items`, `splits`), que estavam com regras
// vazias (= leitura pública, sem sessão): em produção qualquer pessoa listava
// grupos com `invite_code`, divisões com `share_code`, encomendas e itens.
// Copiar para `pb_migrations/` no servidor (nome a começar por timestamp) e
// reiniciar — OU aplicar via API de admin com
// `node scripts/apply-security-rules.mjs --apply` (mesmas regras; é o script
// que também roda os códigos de convite/partilha já expostos).
//
// Modelo de permissões (o mais restrito que não parte nenhum fluxo atual):
//   groups  — ler: membros · criar: o próprio como criador · editar: admins
//             (não mudam o criador) · apagar: criador. Entrar por convite
//             passa por `/api/groups/invite/[code]` (superuser).
//   trips   — ler: membros · escrever: admins do grupo (só as páginas /admin
//             escrevem viagens).
//   orders  — membros do grupo (há encomendas criadas por outra pessoa —
//   items     `createdByUserId`, "mover item" — permissões planas, como nas
//             despesas).
//   splits  — membros do grupo, OU pedido anónimo com o `share_code` certo no
//             cabeçalho `X-Share-Code` (link público `/split/[code]`, ver
//             `src/lib/splitShareAdmin.ts`), que só pode mexer em
//             `items`/`items_version`. Update mantém o controlo de
//             concorrência: `items_version` enviado tem de ser > o guardado.
//
// ⚠️ Best-effort sobre a versão exata do servidor (mesma ressalva do
// `1_ledger.js`). Rollback não repõe as regras antigas de propósito — eram
// públicas.

const MEMBER = (path) => `${path}.members.id ?= @request.auth.id`;
const ADMIN = (path) => `${path}.admins.id ?= @request.auth.id`;

// Campos de `splits` que o link público NUNCA pode alterar (tudo menos
// `items`/`items_version`).
const SPLIT_LOCKED_FIELDS = [
  'allowed_modes', 'confirmed_participants', 'created_by', 'description',
  'group_id', 'name', 'participants', 'share_active', 'share_code', 'status',
  'splitwise_expense_id', 'splitwise_exported_at', 'splitwise_participant_map',
];
const SHARE_MATCH =
  'share_active = true && share_code != "" && share_code = @request.headers.x_share_code';
const SHARE_WRITE =
  `@request.auth.id = "" && ${SHARE_MATCH} && ` +
  SPLIT_LOCKED_FIELDS.map((f) => `@request.body.${f}:isset = false`).join(' && ');
const VERSION_OK =
  '(@request.body.items_version:isset = false || @request.body.items_version > items_version)';

const RULES = {
  groups: {
    listRule: 'members.id ?= @request.auth.id',
    viewRule: 'members.id ?= @request.auth.id',
    createRule:
      '@request.auth.id != "" && @request.body.creator = @request.auth.id' +
      ' && @request.body.members:length <= 1 && @request.body.admins:length <= 1',
    updateRule: 'admins.id ?= @request.auth.id && @request.body.creator:isset = false',
    deleteRule: 'creator = @request.auth.id',
  },
  trips: {
    listRule: MEMBER('group_id'),
    viewRule: MEMBER('group_id'),
    createRule: ADMIN('group_id'),
    updateRule: `${ADMIN('group_id')} && @request.body.group_id:isset = false`,
    deleteRule: ADMIN('group_id'),
  },
  orders: {
    listRule: MEMBER('trip_id.group_id'),
    viewRule: MEMBER('trip_id.group_id'),
    createRule: MEMBER('trip_id.group_id'),
    updateRule: MEMBER('trip_id.group_id'),
    deleteRule: MEMBER('trip_id.group_id'),
  },
  items: {
    listRule: MEMBER('order_id.trip_id.group_id'),
    viewRule: MEMBER('order_id.trip_id.group_id'),
    createRule: MEMBER('order_id.trip_id.group_id'),
    updateRule: MEMBER('order_id.trip_id.group_id'),
    deleteRule: MEMBER('order_id.trip_id.group_id'),
  },
  splits: {
    listRule: `${MEMBER('group_id')} || (${SHARE_MATCH})`,
    viewRule: `${MEMBER('group_id')} || (${SHARE_MATCH})`,
    createRule: MEMBER('group_id'),
    updateRule: `(${MEMBER('group_id')} || (${SHARE_WRITE})) && ${VERSION_OK}`,
    deleteRule: MEMBER('group_id'),
  },
};

migrate(
  (app) => {
    for (const [name, rules] of Object.entries(RULES)) {
      const collection = app.findCollectionByNameOrId(name);
      for (const [key, rule] of Object.entries(rules)) {
        collection[key] = rule;
      }
      app.save(collection);
    }
  },
  () => {
    // Intencionalmente vazio — ver nota no topo.
  },
);
