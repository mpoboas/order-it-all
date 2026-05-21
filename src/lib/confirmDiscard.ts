export const UNSAVED_DRAFT_MESSAGE =
    'Descartar? Perdes o que já preencheste.';

/** Browser confirm — same UX as discard on minimized sheet trash */
export function confirmDiscard(message = UNSAVED_DRAFT_MESSAGE): boolean {
    return confirm(message);
}
