declare module 'web-haptics/react' {
    import type { HapticPreset, HapticPattern } from 'web-haptics';

    export interface WebHapticsHook {
        trigger: (preset?: HapticPreset | HapticPattern) => void;
        isSupported: boolean;
    }

    export function useWebHaptics(): WebHapticsHook;
}

declare module 'web-haptics' {
    export type HapticPreset = 'success' | 'error' | 'nudge' | 'heavy';

    export interface HapticStep {
        duration: number;
        delay?: number;
        intensity?: number;
    }

    export type HapticPattern = HapticStep[];
}
