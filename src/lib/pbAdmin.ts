import PocketBase from 'pocketbase';

/**
 * Cliente PocketBase autenticado como super-utilizador — só para rotas de
 * servidor que precisam de ler fora das regras normais (ex.: montar o
 * `parties` de um split partilhado publicamente, cujo grupo/placeholders o
 * visitante anónimo não tem permissão para ler diretamente). Nunca importar
 * isto num componente de cliente.
 *
 * A sessão fica em cache no processo (evita autenticar a cada pedido); volta
 * a autenticar sozinho se o token deixar de ser válido.
 */
let cachedPb: PocketBase | null = null;

export async function getAdminPb(): Promise<PocketBase> {
  if (cachedPb?.authStore.isValid) return cachedPb;

  const url = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top';
  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Server misconfiguration');
  }

  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(email, password);
  cachedPb = pb;
  return pb;
}
