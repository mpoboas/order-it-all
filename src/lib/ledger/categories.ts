import type { IconName } from '@/components/ui/Icon';

export interface ExpenseCategory {
  id: string;
  label: string;
  icon: IconName;
}

/** Categorias do livro-razão — id gravado em `Expense.category`. A última
 *  ("other") é o valor por omissão quando nada corresponde. */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: 'food', label: 'Comida e bebidas', icon: 'restaurant' },
  { id: 'groceries', label: 'Mercearia', icon: 'local_grocery_store' },
  { id: 'transport', label: 'Transportes', icon: 'directions_car' },
  { id: 'home', label: 'Casa e renda', icon: 'home' },
  { id: 'utilities', label: 'Contas e serviços', icon: 'bolt' },
  { id: 'entertainment', label: 'Lazer', icon: 'theaters' },
  { id: 'health', label: 'Saúde', icon: 'medical_services' },
  { id: 'travel', label: 'Viagens', icon: 'flight' },
  { id: 'shopping', label: 'Compras', icon: 'shopping_bag' },
  { id: 'pets', label: 'Animais', icon: 'pets' },
  { id: 'other', label: 'Outros', icon: 'more_horiz' },
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
