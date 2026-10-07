import { describe, expect, it } from 'vitest';
import { splitItemName, withOriginalName } from './itemName';

describe('splitItemName', () => {
  it('separa o original entre parênteses no fim', () => {
    expect(splitItemName('Cebola (ZWIEBEL)')).toEqual({ title: 'Cebola', original: 'ZWIEBEL' });
  });

  it('deixa nomes sem parênteses intactos', () => {
    expect(splitItemName('Leite')).toEqual({ title: 'Leite' });
  });

  it('só olha para os parênteses do fim', () => {
    expect(splitItemName('Sumo (laranja) natural')).toEqual({ title: 'Sumo (laranja) natural' });
  });

  it('ignora parênteses vazios', () => {
    expect(splitItemName('Pão ( )')).toEqual({ title: 'Pão ( )' });
  });
});

describe('withOriginalName', () => {
  it('junta o original entre parênteses', () => {
    expect(withOriginalName('Cebola', 'ZWIEBEL')).toBe('Cebola (ZWIEBEL)');
  });

  it('omite o original quando é igual (marcas, talões em PT)', () => {
    expect(withOriginalName('Nestle Nesquik', 'NESTLE NESQUIK')).toBe('Nestle Nesquik');
    expect(withOriginalName('Pão de Açúcar', 'PAO DE ACUCAR')).toBe('Pão de Açúcar');
  });

  it('omite o original vazio ou ausente', () => {
    expect(withOriginalName('Kiwi', '')).toBe('Kiwi');
    expect(withOriginalName('Kiwi', undefined)).toBe('Kiwi');
  });

  it('tira parênteses do original para o formato não partir', () => {
    expect(withOriginalName('Água', 'VIO (STILL)')).toBe('Água (VIO STILL)');
  });

  it('usa o original se o nome traduzido vier vazio', () => {
    expect(withOriginalName('  ', 'ZWIEBEL')).toBe('ZWIEBEL');
  });

  it('é reversível com splitItemName', () => {
    expect(splitItemName(withOriginalName('Pimentos', 'PAPRIKA ORANGE'))).toEqual({
      title: 'Pimentos',
      original: 'PAPRIKA ORANGE',
    });
  });
});
