/**
 * Preparação da foto do talão antes de a mandar para a server action.
 *
 * Porquê: as server actions correm em funções do Netlify, que rejeitam pedidos
 * acima de 6 MB — e o corpo binário vai em base64 (+33%), por isso uma imagem
 * só passa até ~4,5 MB. Uma foto de galeria tem facilmente 8 MB (4000×2252): o
 * pedido morria no Netlify antes de chegar ao código, sem logs.
 *
 * Como (padrão da indústria para upload de imagens a partir do browser):
 * - Reduzir por ORÇAMENTO DE PÍXEIS, não só pelo lado maior — um talão comprido
 *   (1:5) reduzido a "2400px de altura" ficava com ~480px de largura e letras
 *   ilegíveis; com orçamento de píxeis mantém a largura útil.
 * - Nunca acima de 3072px no lado maior: é o máximo que o Gemini usa — ele
 *   reduz do lado dele tudo o que for maior, por isso mandar mais é desperdício.
 * - Recomprimir em JPEG com qualidade decrescente até caber num alvo de bytes
 *   (como o `maxSizeMB` do browser-image-compression), reduzindo dimensões só
 *   em último recurso.
 * Medido (Out 2026, gemini-3.8-flash): talão REWE real de 39 linhas lido sem
 * erros desde 800px até à original (4000px, 8 MB); talão sintético de 149
 * linhas (1:6) lido sem erros a 512×3072 — e mais depressa do que a 816×4899.
 * Os ~1100 tokens de imagem são os mesmos em qualquer tamanho.
 */

/** Máximo que o Gemini aproveita no lado maior. */
const MAX_SIDE_PX = 3072;
/** ~4 MP: chega para talões compridos com letra pequena. */
const MAX_PIXELS = 4_000_000;
/** Alvo do ficheiro final — folga larga para o limite do Netlify e rede lenta. */
const TARGET_BYTES = 1.5 * 1024 * 1024;
const QUALITY_STEPS = [0.85, 0.75, 0.65] as const;
/** Fator de redução quando nenhuma qualidade chega ao alvo. */
const DOWNSCALE_STEP = 0.75;
const MIN_SIDE_PX = 1000;

/** Teto duro para o ficheiro enviado (6 MB do Netlify − base64 − margem). */
export const MAX_SCAN_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Formatos que o Gemini aceita como imagem, além de PDF. */
const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
};

/**
 * Alguns browsers (Android/desktop) entregam HEIC com `type` vazio — o servidor
 * assumia então `image/jpeg` e o Gemini recebia o MIME errado.
 */
export function withInferredType(file: File): File {
  if (file.type) return file;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = EXT_MIME[ext];
  return type ? new File([file], file.name, { type }) : file;
}

export function fitDimensions(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(
    1,
    MAX_SIDE_PX / Math.max(width, height),
    Math.sqrt(MAX_PIXELS / (width * height)),
  );
  return { width: Math.floor(width * scale), height: Math.floor(height * scale) };
}

function encode(source: CanvasImageSource, width: number, height: number, quality: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Reduz e recomprime a imagem para JPEG dentro do orçamento. PDFs e imagens que
 * o browser não descodifica (HEIC fora do Safari — o Gemini lê HEIC na mesma)
 * passam inalterados; quem chama valida com `MAX_SCAN_UPLOAD_BYTES`.
 */
export async function prepareReceiptImage(input: File): Promise<File> {
  const file = withInferredType(input);
  if (!file.type.startsWith('image/')) return file;

  let bitmap: ImageBitmap;
  try {
    // `from-image` aplica a orientação EXIF — senão a foto ia deitada.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }

  try {
    let { width, height } = fitDimensions(bitmap.width, bitmap.height);
    const alreadyFits =
      width === bitmap.width && file.size <= TARGET_BYTES && file.type === 'image/jpeg';
    if (alreadyFits) return file;

    let best: Blob | null = null;
    for (;;) {
      for (const quality of QUALITY_STEPS) {
        const blob = await encode(bitmap, width, height, quality);
        if (!blob) return file;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= TARGET_BYTES) break;
      }
      if (best!.size <= TARGET_BYTES || Math.min(width, height) * DOWNSCALE_STEP < MIN_SIDE_PX) {
        break;
      }
      width = Math.round(width * DOWNSCALE_STEP);
      height = Math.round(height * DOWNSCALE_STEP);
      best = null;
    }

    if (!best || best.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([best], name, { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}

/**
 * Pedido de câmara para documentos: sem restrições, `getUserMedia` dá 640×480
 * na maioria dos browsers — pouco para um talão comprido. `ideal` não falha em
 * câmaras piores, só pede o máximo disponível.
 */
export const RECEIPT_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: 'environment',
    width: { ideal: 3840 },
    height: { ideal: 2160 },
  },
};
