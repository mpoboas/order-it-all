/**
 * Bottom floating stack (viewport bottom → up):
 * 1. BottomNav (h-16 + safe-bottom padding on nav)
 * 2. gap
 * 3. Minimized wizard pill
 * 4. gap
 * 5. StickyActionCard / FAB
 */

/** Matches BottomNav: h-16 + .safe-bottom padding on the nav element */
export const BOTTOM_NAV_TOTAL_HEIGHT =
  'calc(4rem + var(--safe-bottom) + 1rem)';

const dockBase = (hasBottomNav: boolean) =>
  hasBottomNav
    ? `calc(${BOTTOM_NAV_TOTAL_HEIGHT} + var(--dock-gap))`
    : 'calc(var(--safe-bottom) + var(--dock-gap))';

/** Minimized sheet pill — first slot above nav */
export function getMinimizedSheetBottom(hasBottomNav: boolean): string {
  return dockBase(hasBottomNav);
}

/** Sticky notification when no minimized wizard */
export function getNotificationCardBottom(hasBottomNav: boolean): string {
  return dockBase(hasBottomNav);
}

/** Sticky / FAB when minimized wizard is visible */
export function getStackAboveMinimizedBottom(hasBottomNav: boolean): string {
  return `calc(${dockBase(hasBottomNav)} + var(--minimized-dock-height) + var(--dock-gap))`;
}

/** Member FAB */
export function getFabBottom(hasBottomNav: boolean, stackAboveMinimized = false): string {
  if (stackAboveMinimized) {
    return `calc(${getStackAboveMinimizedBottom(hasBottomNav)} + 0.25rem)`;
  }
  if (hasBottomNav) {
    return `calc(${BOTTOM_NAV_TOTAL_HEIGHT} + var(--dock-gap) + 0.5rem)`;
  }
  return 'calc(var(--safe-bottom) + 1.25rem)';
}
