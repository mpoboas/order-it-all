export type SheetSession = 'closed' | 'expanded' | 'minimized';

export function isSheetActive(session: SheetSession): boolean {
  return session !== 'closed';
}

export function hasAnyActiveSheet(...sessions: SheetSession[]): boolean {
  return sessions.some(isSheetActive);
}
