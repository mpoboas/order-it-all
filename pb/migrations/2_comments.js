// Migração PocketBase — comentários numa despesa (Fase 5 do plano
// "Splitwise killer"). Copiar para `pb_migrations/` no servidor (nome a
// começar por timestamp) e reiniciar o PocketBase.
//
// `group_id` está desnormalizado (copiado da despesa ao criar o comentário)
// para reaproveitar tal-e-qual a infraestrutura de sync/realtime global já
// usada por `expenses`/`placeholders` (que filtra por `group_id.members`).

migrate(
  (app) => {
    const groups = app.findCollectionByNameOrId('groups');
    const users = app.findCollectionByNameOrId('users');
    const expenses = app.findCollectionByNameOrId('expenses');

    const comments = new Collection({
      name: 'expense_comments',
      type: 'base',
      fields: [
        {
          name: 'expense_id',
          type: 'relation',
          required: true,
          collectionId: expenses.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'group_id',
          type: 'relation',
          required: true,
          collectionId: groups.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'user',
          type: 'relation',
          required: true,
          collectionId: users.id,
          maxSelect: 1,
        },
        { name: 'content', type: 'text', required: true, max: 2000 },
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_expense_comments_expense ON expense_comments (expense_id)',
        'CREATE INDEX idx_expense_comments_group ON expense_comments (group_id)',
      ],
      listRule: 'group_id.members ~ @request.auth.id',
      viewRule: 'group_id.members ~ @request.auth.id',
      createRule: 'group_id.members ~ @request.auth.id',
      // Só o autor edita/apaga o próprio comentário.
      updateRule: 'user = @request.auth.id',
      deleteRule: 'user = @request.auth.id',
    });
    app.save(comments);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('expense_comments'));
    } catch { /* já não existe */ }
  },
);
