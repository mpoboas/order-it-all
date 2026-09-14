import type { IconName } from '@/components/ui/Icon';

/** Tons já existentes no design system (`bg-{tint}-bg`/`text-{tint}-fg`) —
 *  o tile de categoria (`CategoryIcon`) usa-os para ficar legível também em
 *  dark, à Splitwise (nunca `danger`, reservado para destrutivo). */
export type CategoryTint = 'info' | 'success' | 'warning';

export interface ExpenseCategory {
  id: string;
  label: string;
  icon: IconName;
  tint: CategoryTint;
}

/** Categorias do livro-razão — id gravado em `Expense.category`. A última
 *  ("other") é o valor por omissão quando nada corresponde. */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: 'food', label: 'Comida e bebidas', icon: 'restaurant', tint: 'warning' },
  { id: 'groceries', label: 'Mercearia', icon: 'local_grocery_store', tint: 'success' },
  { id: 'transport', label: 'Transportes', icon: 'directions_car', tint: 'info' },
  { id: 'home', label: 'Casa e renda', icon: 'home', tint: 'info' },
  { id: 'utilities', label: 'Contas e serviços', icon: 'bolt', tint: 'warning' },
  { id: 'entertainment', label: 'Lazer', icon: 'theaters', tint: 'success' },
  { id: 'health', label: 'Saúde', icon: 'medical_services', tint: 'warning' },
  { id: 'travel', label: 'Viagens', icon: 'flight', tint: 'info' },
  { id: 'shopping', label: 'Compras', icon: 'shopping_bag', tint: 'success' },
  { id: 'pets', label: 'Animais', icon: 'pets', tint: 'warning' },
  { id: 'other', label: 'Outros', icon: 'more_horiz', tint: 'info' },
];

const CATEGORY_BY_ID = new Map(EXPENSE_CATEGORIES.map((c) => [c.id, c]));

const DEFAULT_CATEGORY = EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];

export function getCategory(id: string | undefined): ExpenseCategory {
  return (id && CATEGORY_BY_ID.get(id)) || DEFAULT_CATEGORY;
}

/** Palavras-chave pt-PT (minúsculas, sem acento) → categoria. A primeira que
 *  corresponder à descrição vence; ordem importa (mais específico primeiro). */
const KEYWORD_RULES: Array<{ category: string; keywords: string[] }> = [
  {
    category: 'groceries',
    keywords: [
      'mercearia', 'continente', 'pingo doce', 'lidl', 'auchan', 'minipreco', 'mini-preco',
      'supermercado', 'compras', 'e-leclerc', 'leclerc',
    ],
  },
  {
    category: 'food',
    keywords: [
      'jantar', 'almoco', 'almoço', 'pequeno-almoco', 'restaurante', 'cafe', 'café', 'pizza',
      'hamburguer', 'sushi', 'lanche', 'bebidas', 'bar', 'padaria', 'gelado',
    ],
  },
  {
    category: 'transport',
    keywords: [
      'uber', 'bolt', 'taxi', 'gasolina', 'combustivel', 'combustível', 'portagem', 'portagens',
      'estacionamento', 'comboio', 'cp ', 'metro', 'autocarro', 'via verde',
    ],
  },
  {
    category: 'home',
    keywords: ['renda', 'aluguer', 'condominio', 'condomínio'],
  },
  {
    category: 'utilities',
    keywords: ['luz', 'eletricidade', 'água', 'agua', 'gas', 'gás', 'internet', 'wifi', 'telemovel', 'telemóvel'],
  },
  {
    category: 'entertainment',
    keywords: ['cinema', 'concerto', 'festival', 'bilhetes', 'netflix', 'spotify', 'jogo', 'discoteca'],
  },
  {
    category: 'health',
    keywords: ['farmacia', 'farmácia', 'medico', 'médico', 'consulta', 'hospital'],
  },
  {
    category: 'travel',
    keywords: ['viagem', 'hotel', 'alojamento', 'voo', 'aviao', 'avião', 'airbnb'],
  },
  {
    category: 'pets',
    keywords: ['veterinario', 'veterinário', 'racao', 'ração'],
  },
];

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Sugere uma categoria a partir da descrição (ex.: "Jantar" → comida). Usada
 *  como default no formulário de despesa — o utilizador pode sempre trocar. */
export function guessCategory(description: string): string {
  const norm = normalize(description);
  if (!norm.trim()) return DEFAULT_CATEGORY.id;
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((kw) => norm.includes(normalize(kw)))) {
      return rule.category;
    }
  }
  return DEFAULT_CATEGORY.id;
}
