import { describe, expect, it } from 'vitest';
import type { SplitItem } from '@/lib/types';
import { onlyParticipationChanged } from './splitShare';

const item = (name: string, price: number, participants: string[] = []): SplitItem =>
  ({ name, price, participants }) as SplitItem;

describe('onlyParticipationChanged (link público só mexe em partes)', () => {
  const before = [item('Vinho', 11, ['a', 'b']), item('Bitoque', 12.9, ['b'])];

  it('aceita entrar/sair de itens', () => {
    expect(onlyParticipationChanged(before, [item('Vinho', 11, ['a']), item('Bitoque', 12.9, ['a', 'b'])])).toBe(true);
  });

  it('recusa mudar o preço de um item', () => {
    expect(onlyParticipationChanged(before, [item('Vinho', 1, ['a', 'b']), item('Bitoque', 12.9, ['b'])])).toBe(false);
  });

  it('recusa adicionar ou apagar itens', () => {
    expect(onlyParticipationChanged(before, [...before, item('Extra', 5)])).toBe(false);
    expect(onlyParticipationChanged(before, [before[0]])).toBe(false);
  });

  it('recusa renomear um item', () => {
    expect(onlyParticipationChanged(before, [item('Água', 11, ['a', 'b']), before[1]])).toBe(false);
  });
});
