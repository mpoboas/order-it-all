import { ImageResponse } from 'next/og';
import { coverGradientFor } from '@/lib/coverColor';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { PB_ID_RE } from '@/lib/serverAuth';
import { getInitials } from '@/lib/utils';

/**
 * A imagem de uma pessoa nas notificações do Android (a grande, à direita):
 * redonda, com fundo transparente — o Android mostra-a tal como a recebe.
 * A foto de perfil, se houver (`user` + `file`); senão, as iniciais com as
 * cores do `<Avatar>` da app.
 *
 * Só aceita o id e o nome do ficheiro (validados) e monta o URL do PocketBase
 * aqui — nunca um URL qualquer, para não servir de proxy de imagens alheias.
 * A imagem de uma combinação nunca muda (foto nova = ficheiro novo): cache longa.
 */

const SIZE = 192;
const FILE_RE = /^[\w.-]{1,120}$/;

async function photoDataUrl(user: string | null, file: string | null): Promise<string | null> {
  if (!user || !file || !PB_ID_RE.test(user) || !FILE_RE.test(file)) return null;
  const url = getUserAvatarUrl(user, file);
  if (!url) return null;
  try {
    const res = await fetch(url);
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const name = (params.get('name') ?? '').trim().slice(0, 60) || '?';
  const photo = await photoDataUrl(params.get('user'), params.get('file'));

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- ImageResponse (satori), não é a página
          <img src={photo} alt="" width={SIZE} height={SIZE} style={{ borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundImage: coverGradientFor(name),
              color: 'white',
              fontSize: 80,
              fontWeight: 700,
              letterSpacing: -2,
            }}
          >
            {getInitials(name)}
          </div>
        )}
      </div>
    ),
    {
      width: SIZE,
      height: SIZE,
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    },
  );
}
