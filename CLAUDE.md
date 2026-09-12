# Instruções para o Claude Code

## Codegraph

Sempre que for necessário analisar ou explorar este projeto (perceber como algo funciona, localizar
símbolos, avaliar o impacto de uma mudança, etc.), usar a ferramenta `mcp__codegraph__codegraph_explore`
antes de recorrer a leitura manual de ficheiros ou grep. O codegraph mantém um grafo de conhecimento
indexado do workspace e devolve o código-fonte relevante já acompanhado de quem o chama e o que afeta,
com muito menos chamadas do que uma exploração manual.

## Design system

O design foi unificado (Set 2026) depois de a app ter crescido sem um sistema. As regras abaixo existem
para não regredir — há uma **guarda de lint** (`eslint.config.mjs`, `no-restricted-syntax`) que bloqueia
grande parte disto automaticamente; o resto é convenção.

- **Cores**: nunca cores cruas do Tailwind (`gray-*`, `slate-*`, hex inline `#...`/`bg-[#...]`). Usar os
  tokens semânticos de `src/app/globals.css`: `bg-app`, `bg-surface`, `bg-surface-sunken`,
  `text-ink`/`text-ink-soft`/`text-ink-faint`, `border-hairline`/`border-hairline-strong`, e por estado
  `bg-{success,warning,danger,info}-bg` + `text-{...}-fg` (também `bg-danger`, `bg-status-{pending,bought,missing}`
  para pastilhas saturadas). A cor de ação (marca) é `primary-*`. Exceções conscientes e documentadas:
  `src/app/auth/**` (vidro fosco sempre-claro sobre gradiente — os tokens de tema não se aplicam ali),
  `src/app/dev/ui/**` (mostra as cores cruas de propósito), `Icon.tsx`.
- **Ícones**: `<Icon name="..." />` (`src/components/ui/Icon.tsx`, Lucide) — nunca SVG inline nem emoji como
  ícone funcional. `name` é o nome antigo do Material Icons; se faltar um mapeamento, adiciona ao `MAP`.
- **Primitivos**: `Button`, `Badge`, `Card`, `Money`, `PriceInput`, `Input`/`Textarea`, `EntityListCard`
  (`src/components/ui/`) — usa-os em vez de recriar estilos ad-hoc. Workbench com todos os estados,
  claro/escuro: rota `/dev/ui` (só em dev).
- **Diálogos**: `useConfirm()` (`src/context/ConfirmContext.tsx`) em vez de `window.confirm()`/`alert()`.
  Botões empilhados a toda a largura (não lado-a-lado — rótulos compridos quebravam linha), confirmar
  primeiro, cancelar por baixo com o foco inicial. `tone`: `danger` (destrutivo), `warning` (reversível
  mas com efeito), `default`.
- **Sheets/overlays**: `<Sheet>` (`src/components/ui/Sheet.tsx`) para tudo que desliza de baixo — mesmo
  backdrop, cantos, mola (`sheetSpring`/`sheetEase` de `src/lib/motion.ts`) em toda a app.
- **Navegação**: `useAppNavigate()` (`src/hooks/useAppNavigate.ts`), nunca `router.push` bruto — trata
  háptico, guarda de rascunhos por gravar, barra de progresso (`navStart`/`navDone`), e salta o View
  Transitions em ligação lenta (`isSlowConnection`, `useSmartRouter`) para não congelar o ecrã.
- **Datas/moeda**: `formatRelativeOrDate`/`formatEUR` (`src/lib/utils.ts`, `src/lib/money.ts`), pt-PT.
  Nunca `Intl` com `month: 'short'` (dá numérico em pt-PT) nem `toFixed`/template strings para euros.
