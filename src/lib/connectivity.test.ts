import { describe, expect, it, vi } from 'vitest';
import { isAppOffline, reportNetworkFailure, reportNetworkSuccess, subscribeConnectivity } from './connectivity';

describe('connectivity — lie-fi', () => {
  it('uma falha de rede põe a app offline e uma resposta do servidor tira-a', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeConnectivity(listener);
    expect(isAppOffline()).toBe(false);

    reportNetworkFailure();
    expect(isAppOffline()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    reportNetworkFailure(); // falhas seguidas não voltam a notificar
    expect(listener).toHaveBeenCalledTimes(1);

    reportNetworkSuccess();
    expect(isAppOffline()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    reportNetworkSuccess(); // já online: sem notificação
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
