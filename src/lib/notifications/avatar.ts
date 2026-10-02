/**
 * A imagem de uma pessoa num aviso (Android: a imagem grande à direita) —
 * sempre pela rota `/api/notifications/avatar`, que a devolve redonda: a foto
 * de perfil, se tiver, senão as iniciais nas cores do `<Avatar>` da app.
 * Caminho relativo — o service worker resolve-o no endereço da app.
 */
export function notificationAvatarUrl(user: { id: string; name?: string; avatar?: string } | undefined): string {
  const params = new URLSearchParams({ name: user?.name?.trim() || '?' });
  if (user?.id && user.avatar?.trim()) {
    params.set('user', user.id);
    params.set('file', user.avatar.trim());
  }
  return `/api/notifications/avatar?${params.toString()}`;
}
