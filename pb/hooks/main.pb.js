// Hooks do PocketBase (JSVM, v0.23+). Copiar `pb/hooks/*` para `pb_hooks/` no
// servidor e reiniciar — o PocketBase carrega sozinho os `*.pb.js`; os
// restantes `.js` são módulos, só carregados via `require`.
//
// Cada handler corre num contexto isolado (não vê variáveis/funções de fora
// dele), por isso toda a lógica vive em `handlers.js` e cada registo aqui é
// só um `require` + chamada.

// Despesas: Σ pagadores = Σ partes = total; partes do grupo; mudar de grupo só
// para um grupo onde se é membro; despesas diretas só entre amigos.
onRecordCreateRequest((e) => {
  return require(`${__hooks}/handlers.js`).expense(e, true);
}, 'expenses');

onRecordUpdateRequest((e) => {
  return require(`${__hooks}/handlers.js`).expense(e, false);
}, 'expenses');

// Itens: `order_id` só pode mudar para uma encomenda do MESMO grupo.
onRecordUpdateRequest((e) => {
  return require(`${__hooks}/handlers.js`).itemMove(e);
}, 'items');

// Encomendas: `trip_id` só pode mudar para uma viagem do MESMO grupo.
onRecordUpdateRequest((e) => {
  return require(`${__hooks}/handlers.js`).orderMove(e);
}, 'orders');
