import { NextResponse } from 'next/server';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function isAllowedGoogleAvatarUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'lh3.googleusercontent.com' ||
        parsed.hostname.endsWith('.googleusercontent.com'))
    );
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url || !isAllowedGoogleAvatarUrl(url)) {
    return NextResponse.json({ error: 'URL inválida' }, { status: 400 });
  }

  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'image/*' },
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: 'Não foi possível obter a imagem' },
        { status: upstream.status }
      );
    }

    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_AVATAR_BYTES) {
      return NextResponse.json({ error: 'Imagem demasiado grande' }, { status: 413 });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Google avatar proxy:', error);
    return NextResponse.json(
      { error: 'Erro ao obter a imagem' },
      { status: 502 }
    );
  }
}
