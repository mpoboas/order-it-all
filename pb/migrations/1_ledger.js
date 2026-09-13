/// <reference path="../../pb_data/types.d.ts" />
//
// Migração PocketBase para o livro-razão de despesas (Fase 0 do plano
// "Splitwise killer"). Copia este ficheiro para `pb_migrations/` no servidor
// (nome do ficheiro tem de começar por um timestamp, ex.:
// `1757000000_ledger.js`) e reinicia o PocketBase — ele corre as migrações
// pendentes sozinho no arranque.
//
// ⚠️ Best-effort: escrito às cegas sobre a versão exata do teu PocketBase
// (o cliente JS no package.json é `pocketbase@^0.26`, que corresponde à API
// de migrações abaixo — Collections/Fields como objetos, `app.save`/
// `app.delete`). Se o teu servidor for mais antigo ou mais recente e a sintaxe
// não bater certo, mais vale criar as duas coleções e os dois campos à mão no
// admin, seguindo exatamente esta especificação (nomes, tipos, regras) — o
// resultado final tem de ser o mesmo. Regras de acesso escritas como filtros
// relacionais (`group_id.members ~ @request.auth.id`) — confirma que dão
// erro de sintaxe nenhum ao gravar a coleção no admin antes de confiar nelas.
//
// Procura as coleções existentes pelo nome em vez de assumir ids fixos — os
// ids de `groups`/`users` variam de instalação para instalação.

migrate(
  (app) => {
    const groups = app.findCollectionByNameOrId('groups');
    const users = app.findCollectionByNameOrId('users');
    const splits = app.findCollectionByNameOrId('splits');
    const trips = app.findCollectionByNameOrId('trips');

    // --- placeholders — membros de grupo sem conta na app -------------------
    const placeholders = new Collection({
      name: 'placeholders',
      type: 'base',
      fields: [
        {
          name: 'group_id',
          type: 'relation',
          required: true,
          collectionId: groups.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'name', type: 'text', required: true, max: 200 },
        {
          name: 'claimed_by',
          type: 'relation',
          required: false,
          collectionId: users.id,
          maxSelect: 1,
        },
        {
          name: 'created_by',
          type: 'relation',
          required: true,
          collectionId: users.id,
          maxSelect: 1,
        },
      ],
      indexes: [
        'CREATE INDEX idx_placeholders_group ON placeholders (group_id)',
      ],
      listRule: 'group_id.members ~ @request.auth.id',
      viewRule: 'group_id.members ~ @request.auth.id',
      createRule: 'group_id.members ~ @request.auth.id',
      updateRule: 'group_id.members ~ @request.auth.id',
      deleteRule: 'group_id.members ~ @request.auth.id',
    });
    app.save(placeholders);

    // --- expenses — despesas e pagamentos ("acertar contas") ---------------
    const expenses = new Collection({
      name: 'expenses',
      type: 'base',
      fields: [
        {
          name: 'group_id',
          type: 'relation',
          required: true,
          collectionId: groups.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'kind',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['expense', 'payment'],
        },
        { name: 'description', type: 'text', required: true, max: 500 },
        { name: 'amount', type: 'number', required: true },
        { name: 'date', type: 'date', required: true },
        {
          name: 'category',
          type: 'select',
          required: false,
          maxSelect: 1,
          values: [
            'food', 'groceries', 'transport', 'home', 'utilities',
            'entertainment', 'health', 'travel', 'shopping', 'pets', 'other',
          ],
        },
        { name: 'notes', type: 'text', required: false, max: 2000 },
        {
          name: 'split_mode',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['equal', 'exact', 'percentage', 'shares', 'adjustment', 'itemized'],
        },
        { name: 'payers', type: 'json', required: false, maxSize: 20000 },
        { name: 'shares', type: 'json', required: false, maxSize: 20000 },
        {
          name: 'split_id',
          type: 'relation',
          required: false,
          collectionId: splits.id,
          maxSelect: 1,
        },
        {
          name: 'trip_id',
          type: 'relation',
          required: false,
          collectionId: trips.id,
          maxSelect: 1,
        },
        { name: 'receipt', type: 'file', required: false, maxSelect: 1, maxSize: 10485760 },
        {
          name: 'created_by',
          type: 'relation',
          required: true,
          collectionId: users.id,
          maxSelect: 1,
        },
        {
          name: 'updated_by',
          type: 'relation',
          required: false,
          collectionId: users.id,
          maxSelect: 1,
        },
        { name: 'deleted_at', type: 'date', required: false },
        {
          name: 'deleted_by',
          type: 'relation',
          required: false,
          collectionId: users.id,
          maxSelect: 1,
        },
      ],
      indexes: [
        'CREATE INDEX idx_expenses_group ON expenses (group_id)',
        'CREATE INDEX idx_expenses_date ON expenses (date)',
      ],
      listRule: 'group_id.members ~ @request.auth.id',
      viewRule: 'group_id.members ~ @request.auth.id',
      createRule: 'group_id.members ~ @request.auth.id',
      // Permissões planas: qualquer membro do grupo edita/apaga qualquer
      // despesa (decisão de produto — ver secção "Permissões" do plano).
      updateRule: 'group_id.members ~ @request.auth.id',
      deleteRule: 'group_id.members ~ @request.auth.id',
    });
    app.save(expenses);

    // --- campos novos em coleções existentes --------------------------------
    groups.fields.add(
      new Field({
        name: 'simplify_debts',
        type: 'bool',
      }),
    );
    app.save(groups);

    users.fields.add(
      new Field({
        name: 'mbway_phone',
        type: 'text',
        required: false,
        max: 20,
      }),
    );
    app.save(users);
  },
  (app) => {
    // Rollback — pela ordem inversa.
    try {
      const users = app.findCollectionByNameOrId('users');
      users.fields.removeByName('mbway_phone');
      app.save(users);
    } catch (_) { /* já não existe */ }

    try {
      const groups = app.findCollectionByNameOrId('groups');
      groups.fields.removeByName('simplify_debts');
      app.save(groups);
    } catch (_) { /* já não existe */ }

    try {
      app.delete(app.findCollectionByNameOrId('expenses'));
    } catch (_) { /* já não existe */ }

    try {
      app.delete(app.findCollectionByNameOrId('placeholders'));
    } catch (_) { /* já não existe */ }
  },
);
