'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { extractReceiptLineItems } from '@/app/actions/ai';
import type { SplitItem, User } from '@/lib/types';
import {
  formatCurrency,
  getUserGeminiApiKey,
  isInvoiceScanBlockedToday,
  blockInvoiceScanPayload,
  bumpDailyScanPayload,
} from '@/lib/utils';
import { invoiceScanFailureMessage } from '@/lib/scanFeedback';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { useToast } from '@/context/ToastContext';

type ScanStep = 'upload' | 'processing' | 'review';

interface DraftItem {
  id: string;
  name: string;
  price: string;
}

interface SplitInvoiceScanSheetProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  updateProfile: (data: Partial<User>) => Promise<void>;
  onConfirm: (items: SplitItem[]) => Promise<void>;
}

export function SplitInvoiceScanSheet({
  isOpen,
  onClose,
  user,
  updateProfile,
  onConfirm,
}: SplitInvoiceScanSheetProps) {
  const { showToast } = useToast();
  const [scanStep, setScanStep] = useState<ScanStep>('upload');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<string | null>(null);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const scanBlocked = isInvoiceScanBlockedToday(user);
  const geminiApiKey = getUserGeminiApiKey(user);
  const hasApiKey = Boolean(geminiApiKey);

  const resetScan = useCallback(() => {
    setScanStep('upload');
    setInvoiceFile(null);
    setInvoicePreview(null);
    setDraftItems([]);
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
    if (scanBlocked) {
      showToast(invoiceScanFailureMessage({ code: 'quota_daily' }), 'error');
      return;
    }

    setScanStep('processing');

    try {
      const outcome = await extractReceiptLineItems(invoiceFile, geminiApiKey);

      if (!outcome.ok) {
        if (outcome.failure.code === 'quota_daily') {
          updateProfile(blockInvoiceScanPayload()).catch(console.error);
        }
        showToast(invoiceScanFailureMessage(outcome.failure), 'error');
        setScanStep('upload');
        return;
      }

      updateProfile(bumpDailyScanPayload(user)).catch(console.error);

      setDraftItems(
        outcome.data.items.map((item, idx) => ({
          id: `scan-${idx}-${Date.now()}`,
          name: item.name,
          price: item.price > 0 ? item.price.toFixed(2) : '',
        }))
      );
      setScanStep('review');
    } catch {
      showToast(invoiceScanFailureMessage({ code: 'error' }), 'error');
      setScanStep('upload');
    }
  };

  const updateDraftItem = (id: string, field: 'name' | 'price', value: string) => {
    setDraftItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const removeDraftItem = (id: string) => {
    setDraftItems((prev) => prev.filter((item) => item.id !== id));
  };

  const addBlankDraftItem = () => {
    setDraftItems((prev) => [
      ...prev,
      { id: `manual-${Date.now()}`, name: '', price: '' },
    ]);
  };

  const validDraftItems = draftItems.filter((item) => item.name.trim());
  const draftTotal = validDraftItems.reduce(
    (sum, item) => sum + (parseFloat(item.price) || 0),
    0
  );

  const handleConfirm = async () => {
    if (validDraftItems.length === 0) return;
    setSubmitting(true);
    try {
      const items: SplitItem[] = validDraftItems.map((item) => ({
        name: item.name.trim(),
        price: parseFloat(item.price) || 0,
        participants: [],
        locked: false,
      }));
      await onConfirm(items);
      showToast('Itens adicionados!', 'success');
      handleClose();
    } catch (error) {
      console.error(error);
      showToast('Erro ao adicionar itens', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const sheetTitle =
    scanStep === 'processing'
      ? 'A analisar…'
      : scanStep === 'review'
        ? 'Itens da fatura'
        : 'Scan da fatura';

  const sheetSubtitle =
    scanStep === 'upload'
      ? 'Fotografa ou carrega o talão — o Gemini lê os itens'
      : scanStep === 'processing'
        ? 'A identificar itens e preços'
        : 'Ninguém fica associado — atribuis a seguir';

  const footer =
    scanStep === 'review' ? (
      <div className="flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={() => setScanStep('upload')}>
          Voltar
        </Button>
        <Button
          onClick={handleConfirm}
          className="flex-[2] btn-primary"
          disabled={submitting || validDraftItems.length === 0}
        >
          {submitting
            ? 'A adicionar…'
            : `Adicionar ${validDraftItems.length || ''} item${validDraftItems.length === 1 ? '' : 's'}`}
        </Button>
      </div>
    ) : scanStep === 'upload' && invoiceFile && hasApiKey ? (
      <Button
        onClick={handleProcessInvoice}
        className="btn-primary w-full py-3.5"
        disabled={scanBlocked}
      >
        {scanBlocked ? 'Limite diário atingido — volta amanhã' : 'Analisar fatura'}
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
            A ler os itens do talão…
          </p>
        </div>
      ) : scanStep === 'review' ? (
        <div className="space-y-4 pb-2">
          {draftItems.length === 0 ? (
            <p className="p-4 text-center text-sm text-[var(--text-muted)]">
              Não encontrei itens legíveis nesta fatura.
            </p>
          ) : (
            <div className="rounded-[20px] border border-gray-100 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800 shadow-sm divide-y divide-gray-100 dark:divide-slate-700">
              {draftItems.map((item) => (
                <div key={item.id} className="p-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateDraftItem(item.id, 'name', e.target.value)}
                    placeholder="Nome do item"
                    className="flex-1 min-w-0 px-3 py-2 text-sm font-medium bg-gray-50 dark:bg-slate-900/50 border border-transparent focus:border-violet-500 rounded-lg dark:text-gray-100 focus:outline-none transition-colors"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.price}
                    onChange={(e) => updateDraftItem(item.id, 'price', e.target.value)}
                    placeholder="0.00"
                    className="w-20 shrink-0 px-2 py-2 text-sm font-mono text-right bg-gray-50 dark:bg-slate-900/50 border border-transparent focus:border-violet-500 rounded-lg dark:text-gray-100 focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => removeDraftItem(item.id)}
                    className="shrink-0 p-1.5 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    aria-label="Remover item"
                  >
                    <span className="material-icons text-lg">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={addBlankDraftItem}
            className="w-full py-2.5 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-500 dark:text-gray-400 font-bold hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-primary-300 dark:hover:border-primary-700 hover:text-primary-600 dark:hover:text-primary-400 transition flex items-center justify-center gap-2"
          >
            <span className="material-icons text-base">add</span>
            Adicionar item
          </button>

          {draftTotal > 0 && (
            <div className="flex items-center justify-between px-1 text-sm">
              <span className="font-bold text-gray-500 dark:text-gray-400">Total</span>
              <span className="font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(draftTotal)}
              </span>
            </div>
          )}
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

          {hasApiKey && scanBlocked && (
            <p className="text-center text-[10px] text-[var(--text-muted)] font-medium">
              Limite diário do Gemini atingido — volta amanhã.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
