import { describe, expect, it } from 'vitest';
import { guessCategory, getCategory } from './categories';

describe('guessCategory', () => {
  it('reconhece palavras-chave pt-PT comuns', () => {
    expect(guessCategory('Jantar no restaurante')).toBe('food');
    expect(guessCategory('Compras no Continente')).toBe('groceries');
    expect(guessCategory('Uber para casa')).toBe('transport');
    expect(guessCategory('Renda de setembro')).toBe('home');
  });

  it('ignora acentuação e maiúsculas', () => {
    expect(guessCategory('JANTAR DE ANIVERSÁRIO')).toBe('food');
  });

  it('cai em "other" quando não reconhece nada', () => {
    expect(guessCategory('xyz123')).toBe('other');
    expect(guessCategory('')).toBe('other');
  });
});

describe('getCategory', () => {
  it('devolve a categoria pelo id, ou "other" por omissão', () => {
    expect(getCategory('food').label).toBe('Comida e bebidas');
    expect(getCategory('inexistente').id).toBe('other');
    expect(getCategory(undefined).id).toBe('other');
  });
});
