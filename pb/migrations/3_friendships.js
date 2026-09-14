/// <reference path="../../pb_data/types.d.ts" />
//
// Migração PocketBase — amizade como entidade própria + despesas sem grupo
// (Fase 8 do plano "Splitwise killer"). Copiar para `pb_migrations/` no
// servidor (nome a começar por timestamp) e reiniciar o PocketBase.
//
// ⚠️ Best-effort, mesma ressalva do `1_ledger.js`: testa cada regra no
// filter-tester do admin antes de confiar nela — em particular
// `group_id = ""` (vazio) para o caso "despesa sem grupo".
//
// `participants` (relation multi para `users`) é o mecanismo de autorização
// para despesas SEM grupo — `group_id.members ~ ...` não dá resultado quando
// não há grupo. Fica sempre preenchido (mesmo em despesas de grupo, onde é
// redundante com `group_id.members`) para poder também ser usado em
// `expand` — fecha de borla um buraco pré-existente em que os ids de
// `payers`/`shares` nunca eram resolvidos via expand.
//
// `friendships` guarda sempre o par canónico `user_a.id < user_b.id`
// (comparação de string) para que um pedido nunca possa ser duplicado nos
// dois sentidos — a UI resolve "quem pediu" via `requested_by`.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const expenses = app.findCollectionByNameOrId('expenses');
    const comments = app.findCollectionByNameOrId('expense_comments');

    // --- friendships — amizade entre dois utilizadores ----------------------
    const friendships = new Collection({
      name: 'friendships',
      type: 'base',
      fields: [
        {
          name: 'user_a',
          type: 'relation',
          required: true,
          collectionId: users.id,
          maxSelect: 1,
        },
        {
          name: 'user_b',
          type: 'relation',
          required: true,
          collectionId: users.id,
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['pending', 'accepted'],
        },
        {
          name: 'requested_by',
          type: 'relation',
          required: true,
          collectionId: users.id,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_friendships_pair ON friendships (user_a, user_b)',
      ],
      listRule: 'user_a = @request.auth.id || user_b = @request.auth.id',
      viewRule: 'user_a = @request.auth.id || user_b = @request.auth.id',
      // user_a < user_b: par canónico, impede pedidos espelhados (A→B e B→A).
      createRule:
        'requested_by = @request.auth.id && (user_a = @request.auth.id || user_b = @request.auth.id) && user_a != user_b && user_a < user_b',
      // Só quem NÃO pediu pode aceitar; identidade do par fica pinada — só
      // se o cliente ENVIAR esses campos é que têm de bater certo com o valor
      // gravado (`:isset`), porque o `accept()` normal só manda `{status}` e
      // um corpo sem o campo não deve reprovar a regra (era o bug: comparar
      // um `@request.body.user_a` ausente contra o valor gravado falhava
      // sempre, dando 404 a um accept legítimo).
      updateRule:
        '(user_a = @request.auth.id || user_b = @request.auth.id) && requested_by != @request.auth.id && (@request.body.user_a:isset = false || @request.body.user_a = user_a) && (@request.body.user_b:isset = false || @request.body.user_b = user_b) && (@request.body.requested_by:isset = false || @request.body.requested_by = requested_by)',
      // Cancelar pedido pendente ou desfazer amizade aceite — qualquer um dos dois.
      deleteRule: 'user_a = @request.auth.id || user_b = @request.auth.id',
    });
    app.save(friendships);

    // --- expenses passa a admitir despesas sem grupo ------------------------
    expenses.fields.getByName('group_id').required = false;
    expenses.fields.add(
      new Field({
        name: 'participants',
        type: 'relation',
        required: false,
        collectionId: users.id,
        maxSelect: 999,
        cascadeDelete: false,
      }),
    );
    {
      // Preserva o modelo de permissões planas para despesas de grupo
      // (qualquer membro edita/apaga qualquer despesa) — `participants` só
      // decide a autorização quando não há grupo.
      const rule =
        '(group_id != "" && group_id.members ~ @request.auth.id) || (group_id = "" && participants ~ @request.auth.id)';
      expenses.listRule = rule;
      expenses.viewRule = rule;
      expenses.createRule = rule;
      expenses.updateRule = rule;
      expenses.deleteRule = rule;
    }
    app.save(expenses);

    // --- expense_comments idem (mas update/delete continuam "autor só") ----
    comments.fields.getByName('group_id').required = false;
    comments.fields.add(
      new Field({
        name: 'participants',
        type: 'relation',
        required: false,
        collectionId: users.id,
        maxSelect: 999,
        cascadeDelete: false,
      }),
    );
    {
      const rule =
        '(group_id != "" && group_id.members ~ @request.auth.id) || (group_id = "" && participants ~ @request.auth.id)';
      comments.listRule = rule;
      comments.viewRule = rule;
      comments.createRule = rule;
      // updateRule/deleteRule inalterados: 'user = @request.auth.id'.
    }
    app.save(comments);
  },
  (app) => {
    // Rollback — pela ordem inversa.
    try {
      const comments = app.findCollectionByNameOrId('expense_comments');
      comments.fields.removeByName('participants');
      comments.fields.getByName('group_id').required = true;
      comments.listRule = 'group_id.members ~ @request.auth.id';
      comments.viewRule = 'group_id.members ~ @request.auth.id';
      comments.createRule = 'group_id.members ~ @request.auth.id';
      app.save(comments);
    } catch (_) { /* já não existe */ }

    try {
      const expenses = app.findCollectionByNameOrId('expenses');
      expenses.fields.removeByName('participants');
      expenses.fields.getByName('group_id').required = true;
      const rule = 'group_id.members ~ @request.auth.id';
      expenses.listRule = rule;
      expenses.viewRule = rule;
      expenses.createRule = rule;
      expenses.updateRule = rule;
      expenses.deleteRule = rule;
      app.save(expenses);
    } catch (_) { /* já não existe */ }

    try {
      app.delete(app.findCollectionByNameOrId('friendships'));
    } catch (_) { /* já não existe */ }
  },
);
