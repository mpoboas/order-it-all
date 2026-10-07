import { describe, expect, it } from 'vitest';
import { fitDimensions, withInferredType } from './receiptImage';

describe('fitDimensions', () => {
  it('deixa imagens pequenas como estão', () => {
    expect(fitDimensions(1200, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('reduz uma foto de telemóvel ao orçamento de ~4 MP', () => {
    const { width, height } = fitDimensions(2252, 4000);
    expect(width * height).toBeLessThanOrEqual(4_000_000);
    expect(height).toBeLessThanOrEqual(3072);
    expect(width / height).toBeCloseTo(2252 / 4000, 2);
  });

  it('limita o lado maior a 3072px num talão comprido', () => {
    expect(fitDimensions(1500, 9000)).toEqual({ width: 512, height: 3072 });
  });
});

describe('withInferredType', () => {
  it('infere o MIME pela extensão quando o browser o deixa vazio (HEIC)', () => {
    const file = withInferredType(new File(['x'], 'IMG_0001.HEIC', { type: '' }));
    expect(file.type).toBe('image/heic');
  });

  it('respeita o MIME que o browser já deu', () => {
    const file = withInferredType(new File(['x'], 'fatura.heic', { type: 'image/jpeg' }));
    expect(file.type).toBe('image/jpeg');
  });

  it('não inventa MIME para extensões desconhecidas', () => {
    expect(withInferredType(new File(['x'], 'fatura', { type: '' })).type).toBe('');
  });
});
