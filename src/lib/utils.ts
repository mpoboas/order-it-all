// Utility functions for Order It All!

/**
 * Get initials from a name (e.g., "João Silva" -> "JS")
 */
export function getInitials(name: string): string {
  if (!name) return '??';
  return name
    .split(' ')
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

/**
 * Get relative time string (e.g., "há 5 minutos")
 */
export function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `há ${days} dia${days > 1 ? 's' : ''}`;
  if (hours > 0) return `há ${hours} hora${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `há ${minutes} minuto${minutes > 1 ? 's' : ''}`;
  return 'Agora mesmo';
}

/**
 * Format currency in Euro
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Parse currency string to number
 */
export function parseCurrency(str: string): number {
  return parseFloat(str.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
}

/**
 * Sanitize string for display (prevent XSS)
 */
export function sanitize(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Format seconds as MM:SS
 */
export function formatTime(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Check if an order is still editable (within 5-minute window)
 */
export function isOrderEditable(canEditUntil: string): boolean {
  const editUntil = new Date(canEditUntil).getTime();
  return Date.now() < editUntil;
}

/**
 * Get remaining edit time in seconds
 */
export function getRemainingEditTime(canEditUntil: string): number {
  const editUntil = new Date(canEditUntil).getTime();
  const remaining = editUntil - Date.now();
  return remaining > 0 ? Math.floor(remaining / 1000) : 0;
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate a random color based on string (for avatars)
 */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

/**
 * cn - Combine class names (simple version of clsx)
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Generate a random ID for local storage items
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Product Emoji Mapping
 * Format: [[keywords], emoji]
 */
const ITEM_EMOJI_MAP: [string[], string][] = [
    // Bebidas Alc
    [['cerveja', 'somersby', 'sommersbys', 'sidra', 'super bock', 'sagres'], '🍺'],
    [['vinho'], '🍷'],
    [['gin', 'vodka', 'licor', 'bebida espirituosa'], '🍸'],

    // Bebidas Não Alc
    [['leite'], '🥛'],
    [['iogurte', 'prota'], '🥣'],
    [['cafe', 'café'], '☕'],
    [['sumo', 'refrigerante', 'coca', 'cola', 'pepsi', 'ice tea'], '🥤'],
    [['agua', 'água', 'garrafões'], '💧'],
    [['energetica', 'energética', 'red bull', 'monster'], '⚡'],

    // Comida
    [['pao', 'pão', 'bijou', 'baguete', 'tostas', 'manhazitos'], '🍞'],
    [['queijo', 'fatias'], '🧀'],
    [['fiambre', 'presunto', 'chourico', 'bacon'], '🥩'],
    [['carne', 'frango', 'bife', 'hamburguer', 'picada', 'almoco', 'almoço'], '🥩'],
    [['peixe', 'atum', 'bacalhau'], '🐟'],

    // Snacks / Cereais
    [['batata', 'frita'], '🍟'],
    [['bolacha', 'biscoito', 'oreo', 'wafers', 'crackers'], '🍪'],
    [['cereais', 'chocapic', 'estrelitas', 'golden', 'corn flakes', 'estreitas'], '🥣'],
    [['tremoços', 'amendoim', 'frutos secos'], '🥜'],
    [['chocolate', 'kitkat', 'snickers'], '🍫'],
    [['gelado', 'magnum', 'cornetto', 'cones'], '🍦'],
    [['donuts', 'bola de berlim'], '🍩'],
    [['croissant'], '🥐'],

    // Fruta e Legumes
    [['uva'], '🍇'],
    [['maca', 'maçã', 'fruta'], '🍎'],
    [['banana'], '🍌'],
    [['laranja', 'limao', 'limão'], '🍊'],
    [['tomate', 'popla'], '🍅'],
    [['batata'], '🥔'],
    [['cebola', 'alho'], '🧅'],
    [['salada', 'alface'], '🥗'],

    // Mercearia
    [['arroz'], '🍚'],
    [['massa', 'esparguete', 'macarrao'], '🍝'],
    [['ovo'], '🥚'],
    [['sal ', 'pimenta', 'azeite', 'oleo', 'vinagre'], '🧂'],
    [['manteiga'], '🧈'],

    // Higiene / Casa
    [['papel', 'higienico', 'guardanapo'], '🧻'],
    [['escova', 'pasta', 'dentes'], '🪥'],
    [['champo', 'gel de banho', 'sabonete'], '🧼'],
    [['gelo'], '🧊'],
    [['protetor'], '🧴'],
];

/**
 * Get an emoji icon based on product name
 */
export function getProductEmoji(name: string): string {
    const lower = name.toLowerCase();
    
    for (const [keywords, emoji] of ITEM_EMOJI_MAP) {
        if (keywords.some(k => lower.includes(k))) {
            return emoji;
        }
    }
    
    return '🛒'; // Default
}
