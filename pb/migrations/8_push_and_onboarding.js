/// <reference path="../../pb_data/types.d.ts" />
//
// Migração PocketBase — o que as notificações e o onboarding precisam e que,
// até aqui, só existia porque foi criado à mão no admin:
//
// - `users.onboarded` (bool) — já viu o carrossel de boas-vindas. Sem o
//   campo, o PocketBase ignora a escrita e o carrossel aparecia sempre.
// - `push_subscriptions` — uma linha por dispositivo com notificações
//   ativas (`endpoint` + `keys` da Web Push API, e `origin`: o endereço da app
//   onde foram ativadas — é para lá que o toque na notificação leva, por isso
//   a app pode ter vários URLs). A app só escreve aqui pela rota
//   `/api/push/subscription` (super-utilizador); as regras deixam cada um
//   ver/apagar só as suas.
//
// Regras: cada um só vê, cria, altera e apaga as SUAS linhas (o superuser
// ignora regras). A coleção criada à mão em produção estava com leitura
// pública — `endpoint` + `keys` de todos os dispositivos à vista de qualquer
// pessoa. Por isso as regras aplicam-se também quando a coleção já existe.
// Manter em sintonia com `scripts/apply-security-rules.mjs`.
//
// Copiar para `pb_migrations/` no servidor (nome a começar por timestamp) e
// reiniciar. Idempotente: campo e coleção só são criados se faltarem.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    if (!users.fields.getByName('onboarded')) {
      users.fields.add(new Field({ name: 'onboarded', type: 'bool', required: false }));
      app.save(users);
    }

    // `@request.auth.id != ""` em TODAS: sem sessão, `@request.auth.id` é vazio e
    // `user = @request.auth.id` deixava ver as linhas com `user` vazio (havia 21
    // dessas, órfãs, em produção, legíveis sem login).
    const own = '@request.auth.id != "" && user = @request.auth.id';
    const rules = {
      listRule: own,
      viewRule: own,
      createRule: own,
      // Não se passa uma subscrição para outra conta.
      updateRule: `${own} && @request.body.user:isset = false`,
      deleteRule: own,
    };

    let existing = null;
    try {
      existing = app.findCollectionByNameOrId('push_subscriptions');
    } catch (_) {
      existing = null;
    }
    if (existing) {
      if (!existing.fields.getByName('origin')) {
        existing.fields.add(new Field({ name: 'origin', type: 'text', required: false, max: 200 }));
      }
      existing.listRule = rules.listRule;
      existing.viewRule = rules.viewRule;
      existing.createRule = rules.createRule;
      existing.updateRule = rules.updateRule;
      existing.deleteRule = rules.deleteRule;
      app.save(existing);
    } else {
      const subs = new Collection({
        name: 'push_subscriptions',
        type: 'base',
        fields: [
          {
            name: 'user',
            type: 'relation',
            required: true,
            collectionId: users.id,
            maxSelect: 1,
            cascadeDelete: true,
          },
          { name: 'endpoint', type: 'text', required: true, max: 1000 },
          { name: 'keys', type: 'json', required: true },
          { name: 'origin', type: 'text', required: false, max: 200 },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_push_subscriptions_endpoint ON push_subscriptions (endpoint)'],
        ...rules,
      });
      app.save(subs);
    }
  },
  (app) => {
    // Rollback deliberadamente vazio: apagar `push_subscriptions` desligava as
    // notificações de toda a gente, e `onboarded` voltava a mostrar o
    // carrossel a todos. Se for mesmo preciso, faz-se à mão no admin.
  },
);
