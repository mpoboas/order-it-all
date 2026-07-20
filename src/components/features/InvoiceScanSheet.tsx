'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { reconcileWithGeminiImage } from '@/app/actions/ai';
import { ordersApi, itemsApi } from '@/lib/pocketbase';
import { buildOrderCreatePayload } from '@/lib/orderParticipants';
import type { User } from '@/lib/types';
import {
  formatCurrency,
  cn,
  getPacificDateString,
  getUserGeminiApiKey,
  DAILY_SCAN_LIMIT,
  getDailyScanCount,
} from '@/lib/utils';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { useToast } from '@/context/ToastContext';

export interface InvoiceScanItem {
  id: string;
  name: string;
  quantity: number;
  notes?: string;
  user_name: string;
}

export interface InvoiceScanOrderCard {
  orderId: string;
  items: InvoiceScanItem[];
}

type ScanStep = 'upload' | 'processing' | 'review';

interface ScanResult {
  matches: { itemId: string; price: number; quantity: number; foundName: string }[];
  extras: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    unit_price: number;
    selected?: boolean;
  }[];
}

interface InvoiceScanSheetProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  orderCards: InvoiceScanOrderCard[];
  members: User[];
  user: User | null;
  updateProfile: (data: Partial<User>) => Promise<void>;
  onApplied: () => void;
}

export function InvoiceScanSheet({
  isOpen,
  onClose,
  tripId,
  orderCards,
  members,
  user,
  updateProfile,
  onApplied,
}: InvoiceScanSheetProps) {
  const { showToast } = useToast();
  const [scanStep, setScanStep] = useState<ScanStep>('upload');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const allListItems = orderCards.flatMap((o) => o.items);
  const dailyCount = getDailyScanCount(user);
  const atDailyLimit = dailyCount >= DAILY_SCAN_LIMIT;
  const geminiApiKey = getUserGeminiApiKey(user);
  const hasApiKey = Boolean(geminiApiKey);

  const resetScan = useCallback(() => {
    setScanStep('upload');
    setInvoiceFile(null);
    setInvoicePreview(null);
    setScanResult(null);
    setApiKeyInput('');
  }, []);

  const handleClose = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    if (invoicePreview) URL.revokeObjectURL(invoicePreview);
    resetScan();
    onClose();
  }, [stream, invoicePreview, resetScan, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    if (scanStep === 'upload' && !invoicePreview && hasApiKey) {
      const startCamera = async () => {
        try {
          const mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
          });
          setStream(mediaStream);
          if (videoRef.current) videoRef.current.srcObject = mediaStream;
        } catch (err) {
          console.warn('Camera unavailable', err);
        }
      };
      startCamera();
    } else if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stream managed intentionally
  }, [isOpen, scanStep, invoicePreview, hasApiKey]);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  };

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const context = canvasRef.current.getContext('2d');
    if (!context) return;

    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0);

    canvasRef.current.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], 'fatura.jpg', { type: 'image/jpeg' });
        setInvoiceFile(file);
        setInvoicePreview(URL.createObjectURL(file));
        stopCamera();
      },
      'image/jpeg',
      0.85
    );
  };

  const handleRetake = () => {
    if (invoicePreview) URL.revokeObjectURL(invoicePreview);
    setInvoiceFile(null);
    setInvoicePreview(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setInvoiceFile(file);
    setInvoicePreview(URL.createObjectURL(file));
    stopCamera();
  };

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    setSubmitting(true);
    try {
      await updateProfile({ geminiApiKey: apiKeyInput.trim() });
      setApiKeyInput('');
      showToast('Chave Gemini guardada', 'success');
    } catch {
      showToast('Erro ao guardar chave', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProcessInvoice = async () => {
    if (!invoiceFile || !geminiApiKey || !user) {
      showToast(!invoiceFile ? 'Seleciona uma fatura' : 'Configura a API Key', 'error');
      return;
    }
    if (atDailyLimit) {
      showToast('Limite diário de análises atingido', 'error');
      return;
    }

    setScanStep('processing');

    const tripItems = orderCards.flatMap((o) =>
      o.items.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        notes: i.notes,
      }))
    );

    try {
      const result = await reconcileWithGeminiImage(
        invoiceFile,
        tripItems,
        geminiApiKey
      );

      const today = getPacificDateString();
      const currentCount =
        user.last_request_date === today ? user.daily_requests_count || 0 : 0;
      updateProfile({
        daily_requests_count: currentCount + 1,
        last_request_date: today,
      }).catch(console.error);

      setScanResult({
        ...result,
        extras: result.extras.map((e, idx) => ({
          ...e,
          id: `extra-${idx}`,
          selected: true,
        })),
      });
      setScanStep('review');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro ao processar fatura';
      showToast(message, 'error');
      setScanStep('upload');
    }
  };

  const handleConfirmReconciliation = async () => {
    if (!scanResult) return;
    setSubmitting(true);

    try {
      const updatePromises = scanResult.matches.map((m) => {
        const qty = m.quantity > 0 ? m.quantity : 1;
        const unitPrice = m.price / qty;
        return itemsApi.update(m.itemId, {
          price: m.price,
          quantity: qty,
          unit_price: unitPrice,
          found_status: 'found',
        });
      });

      const selectedExtras = scanResult.extras.filter((e) => e.selected);
      let extrasPromise = Promise.resolve();

      if (selectedExtras.length > 0) {
        extrasPromise = (async () => {
          const participantIds = members.map((m) => m.id);
          const createPayload = buildOrderCreatePayload({
            tripId,
            participantIds,
            members,
            audienceType: 'all',
            createdByUserId: user?.id || '',
          });
          const order = await ordersApi.create(createPayload);

          for (const extra of selectedExtras) {
            const qty = extra.quantity > 0 ? extra.quantity : 1;
            const unitPrice =
              extra.unit_price > 0 ? extra.unit_price : extra.price / qty;
            await itemsApi.create({
              order_id: order.id,
              name: extra.name,
              quantity: qty,
              price: extra.price,
              unit_price: unitPrice,
              found_status: 'found',
            });
          }
        })();
      }

      await Promise.all([...updatePromises, extrasPromise]);

      showToast('Preços atualizados!', 'success');
      onApplied();
      handleClose();
    } catch (error) {
      console.error(error);
      showToast('Erro ao aplicar alterações', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getUnmatchedItems = () => {
    if (!scanResult) return [];
    const matchedIds = new Set(scanResult.matches.map((m) => m.itemId));
    return allListItems.filter((i) => !matchedIds.has(i.id));
  };

  const handleUpdateMatch = (matchIndex: number, newItemId: string) => {
    if (!scanResult) return;
    const newMatches = [...scanResult.matches];
    newMatches[matchIndex] = { ...newMatches[matchIndex], itemId: newItemId };
    setScanResult({ ...scanResult, matches: newMatches });
  };

  const handleUnmatchItem = (matchIndex: number) => {
    if (!scanResult) return;
    const match = scanResult.matches[matchIndex];
    setScanResult({
      matches: scanResult.matches.filter((_, i) => i !== matchIndex),
      extras: [
        {
          id: `unmatched-${Date.now()}`,
          name: match.foundName,
          price: match.price,
          quantity: match.quantity || 1,
          unit_price: match.price / (match.quantity || 1),
          selected: true,
        },
        ...scanResult.extras,
      ],
    });
  };

  const handleMatchExtra = (extraIndex: number, targetItemId: string) => {
    if (!scanResult) return;
    const extra = scanResult.extras[extraIndex];
    setScanResult({
      matches: [
        ...scanResult.matches,
        {
          itemId: targetItemId,
          price: extra.price,
          quantity: extra.quantity,
          foundName: extra.name,
        },
      ],
      extras: scanResult.extras.filter((_, i) => i !== extraIndex),
    });
  };

  const sheetTitle =
    scanStep === 'processing'
      ? 'A analisar…'
      : scanStep === 'review'
        ? 'Rever correspondências'
        : 'Scan da fatura';

  const sheetSubtitle =
    scanStep === 'upload'
      ? 'Fotografa ou carrega o talão — o Gemini cruza com a lista'
      : scanStep === 'processing'
        ? 'A identificar produtos e preços'
        : 'Confirma antes de aplicar';

  const footer =
    scanStep === 'review' ? (
      <div className="flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={() => setScanStep('upload')}>
          Voltar
        </Button>
        <Button
          onClick={handleConfirmReconciliation}
          className="flex-[2] btn-primary"
          disabled={submitting}
        >
          {submitting ? 'A aplicar…' : 'Confirmar'}
        </Button>
      </div>
    ) : scanStep === 'upload' && invoiceFile && hasApiKey ? (
      <Button
        onClick={handleProcessInvoice}
        className="btn-primary w-full py-3.5"
        disabled={atDailyLimit}
      >
        {atDailyLimit ? 'Limite diário atingido' : 'Analisar fatura'}
      </Button>
    ) : undefined;

  return (
    <Sheet
      isOpen={isOpen}
      onClose={handleClose}
      title={sheetTitle}
      subtitle={sheetSubtitle}
      size="large"
      footer={footer}
      footerKey={scanStep}
      minimizedAboveBottomNav
    >
      <canvas ref={canvasRef} className="hidden" aria-hidden />

      {!hasApiKey ? (
        <div className="flex flex-col items-center text-center max-w-sm mx-auto py-4 space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 flex items-center justify-center">
            <span className="material-icons text-3xl">key</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">
              Chave Gemini
            </h3>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Usa a tua chave gratuita do Google AI Studio. Fica guardada no teu perfil.
            </p>
            <p className="text-xs text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/50 border border-violet-100 dark:border-violet-800 rounded-xl p-3 mb-4">
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline"
              >
                aistudio.google.com
              </a>
            </p>
            <form onSubmit={handleSaveApiKey} className="space-y-3 w-full">
              <input
                type="password"
                autoComplete="off"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="input w-full text-center font-mono text-sm"
                placeholder="Cole a API key aqui"
                required
              />
              <Button type="submit" disabled={submitting} className="btn-primary w-full">
                {submitting ? 'A guardar…' : 'Guardar e continuar'}
              </Button>
            </form>
          </div>
        </div>
      ) : scanStep === 'processing' ? (
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
          <LoadingSpinner size="lg" />
          <p className="text-sm text-[var(--text-muted)] max-w-xs">
            A comparar o talão com {allListItems.length} produto
            {allListItems.length === 1 ? '' : 's'} da viagem…
          </p>
        </div>
      ) : scanStep === 'review' && scanResult ? (
        <div className="space-y-4 pb-2">
          <section className="rounded-[20px] border border-emerald-200 dark:border-emerald-800/60 overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
            <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900/50 flex justify-between items-center gap-2">
              <h4 className="font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5 text-sm">
                <span className="material-icons text-base">check_circle</span>
                Encontrados ({scanResult.matches.length})
              </h4>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {scanResult.matches.length === 0 ? (
                <p className="p-4 text-center text-sm text-[var(--text-muted)]">
                  Nenhuma correspondência automática.
                </p>
              ) : (
                scanResult.matches.map((m, i) => {
                  const originalItem = allListItems.find((item) => item.id === m.itemId);
                  const unmatched = getUnmatchedItems();
                  return (
                    <div key={i} className="p-3 flex flex-col gap-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-0.5">
                            Talão
                          </p>
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {m.foundName}
                          </p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mt-2 mb-0.5">
                            Lista
                          </p>
                          <select
                            className="text-sm font-bold text-[var(--text-primary)] bg-transparent border-b border-dashed border-gray-300 dark:border-slate-600 focus:border-violet-500 focus:ring-0 py-0.5 pr-6 pl-0 cursor-pointer max-w-full"
                            value={m.itemId}
                            onChange={(e) => handleUpdateMatch(i, e.target.value)}
                          >
                            <option value={m.itemId}>
                              {originalItem?.name} ({originalItem?.user_name})
                            </option>
                            <optgroup label="Outros por comprar">
                              {unmatched.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name} ({u.user_name})
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(m.price)}
                          </p>
                          {m.quantity !== originalItem?.quantity && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-0.5">
                              Qtd {originalItem?.quantity} → {m.quantity}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => handleUnmatchItem(i)}
                            className="mt-1 text-[var(--text-muted)] hover:text-red-500 p-1"
                            title="Mover para extras"
                            aria-label="Desassociar"
                          >
                            <span className="material-icons text-lg">link_off</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-[20px] border border-amber-200 dark:border-amber-800/60 overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
            <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-100 dark:border-amber-900/50">
              <h4 className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5 text-sm">
                <span className="material-icons text-base">add_shopping_cart</span>
                Extras ({scanResult.extras.length})
              </h4>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {scanResult.extras.length === 0 ? (
                <p className="p-4 text-center text-sm text-[var(--text-muted)]">
                  Nenhum extra no talão.
                </p>
              ) : (
                scanResult.extras.map((e, i) => (
                  <div
                    key={e.id}
                    className={cn(
                      'p-3',
                      e.selected && 'bg-amber-50/50 dark:bg-amber-950/20'
                    )}
                  >
                    <div className="flex gap-3 items-start">
                      <button
                        type="button"
                        className={cn(
                          'mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors',
                          e.selected
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'border-gray-300 dark:border-slate-600 bg-[var(--bg-primary)]'
                        )}
                        onClick={() => {
                          const newExtras = [...scanResult.extras];
                          newExtras[i] = { ...newExtras[i], selected: !e.selected };
                          setScanResult({ ...scanResult, extras: newExtras });
                        }}
                        aria-pressed={e.selected}
                      >
                        {e.selected && (
                          <span className="material-icons text-sm">check</span>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2">
                          <div>
                            <p className="font-bold text-sm text-[var(--text-primary)]">
                              {e.name}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {e.quantity} un. · {formatCurrency(e.unit_price)}/un
                            </p>
                          </div>
                          <p className="font-bold text-amber-600 dark:text-amber-400 shrink-0">
                            {formatCurrency(e.price)}
                          </p>
                        </div>
                        <select
                          className="mt-2 w-full bg-[var(--bg-primary)] border border-gray-200 dark:border-slate-600 rounded-xl text-xs py-2 px-2 text-[var(--text-primary)]"
                          value=""
                          onChange={(ev) => {
                            if (ev.target.value) handleMatchExtra(i, ev.target.value);
                          }}
                        >
                          <option value="" disabled>
                            Associar a pedido existente…
                          </option>
                          {getUnmatchedItems().map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.user_name})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          {invoicePreview ? (
            <div className="relative w-full max-w-sm mx-auto aspect-[3/4] rounded-[20px] overflow-hidden shadow-lg border border-gray-200 dark:border-slate-700">
              {invoiceFile?.type === 'application/pdf' ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-gray-400 px-4">
                  <span className="material-icons text-5xl">picture_as_pdf</span>
                  <span className="text-xs font-medium text-center truncate max-w-full">{invoiceFile.name}</span>
                </div>
              ) : (
                <img
                  src={invoicePreview}
                  alt="Pré-visualização da fatura"
                  className="w-full h-full object-cover"
                />
              )}
              <button
                type="button"
                onClick={handleRetake}
                className="absolute top-3 right-3 bg-black/55 text-white p-2 rounded-full hover:bg-black/70"
                aria-label="Repetir foto"
              >
                <span className="material-icons text-xl">refresh</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center w-full max-w-sm mx-auto gap-3">
              <div className="relative w-full aspect-[3/4] bg-black rounded-[20px] overflow-hidden">
                {stream ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2">
                    <span className="material-icons text-4xl opacity-50">photo_camera</span>
                    <span className="text-sm">A iniciar câmara…</span>
                  </div>
                )}
              </div>
              {stream && (
                <Button
                  type="button"
                  onClick={handleCapture}
                  variant="secondary"
                  className="w-full rounded-xl font-bold"
                >
                  <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2" />
                  Capturar
                </Button>
              )}
              <div className="relative w-full">
                <div className="absolute inset-0 flex items-center" aria-hidden>
                  <div className="w-full border-t border-gray-200 dark:border-slate-700" />
                </div>
                <p className="relative text-center text-xs text-[var(--text-muted)]">
                  <span className="bg-[var(--bg-primary)] px-2">ou</span>
                </p>
              </div>
              <label className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl font-medium text-sm text-[var(--text-muted)] flex items-center justify-center gap-2 cursor-pointer hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
                <span className="material-icons text-lg">photo_library</span>
                Galeria
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                />
              </label>
            </div>
          )}

          {hasApiKey && (
            <p className="text-center text-[10px] text-[var(--text-muted)] font-medium">
              {atDailyLimit
                ? `Limite diário (${DAILY_SCAN_LIMIT}) atingido`
                : dailyCount > 0
                  ? `${dailyCount}/${DAILY_SCAN_LIMIT} análises hoje`
                  : `Até ${DAILY_SCAN_LIMIT} análises por dia`}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
