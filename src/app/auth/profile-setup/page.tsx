'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { pb, authHeaders } from '@/lib/pocketbase';
import {
    clearOAuthProfileHints,
    loadOAuthProfileHints,
    loadGoogleAvatarFromUrl,
    urlToAvatarFile,
} from '@/lib/googleAuth';
import { safeRedirect, withRedirect } from '@/lib/authRedirect';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Icon } from '@/components/ui/Icon';

export default function ProfileSetupPage() {
    const { user, updateProfile } = useUser();
    const nav = useAppNavigate();
    const redirect = safeRedirect(useSearchParams().get('redirect'));
    const { showToast } = useToast();

    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [googleAvatarUrl, setGoogleAvatarUrl] = useState<string | null>(null);
    const [avatarRemoved, setAvatarRemoved] = useState(false);
    const [hasOAuthHints, setHasOAuthHints] = useState(false);
    const [avatarLoading, setAvatarLoading] = useState(false);

    const [stream, setStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previewObjectUrl = useRef<string | null>(null);

    useEffect(() => {
        const hints = loadOAuthProfileHints();
        if (hints) {
            setHasOAuthHints(true);
            if (hints.oauthAvatarUrl && !avatarRemoved) {
                setGoogleAvatarUrl(hints.oauthAvatarUrl);
                setAvatarLoading(true);
                loadGoogleAvatarFromUrl(hints.oauthAvatarUrl).then((result) => {
                    if (!result) {
                        setAvatarLoading(false);
                        return;
                    }
                    if (previewObjectUrl.current) {
                        URL.revokeObjectURL(previewObjectUrl.current);
                    }
                    previewObjectUrl.current = result.previewUrl;
                    setAvatarPreview(result.previewUrl);
                    setAvatarFile(result.file);
                    setAvatarLoading(false);
                });
            }
        }

        return () => {
            if (previewObjectUrl.current) {
                URL.revokeObjectURL(previewObjectUrl.current);
            }
        };
    }, []);

    useEffect(() => {
        if (user) {
            const hints = loadOAuthProfileHints();
            if (user.name && !hints) {
                setName((prev) => prev || user.name);
            }
            if (user.avatar && !hints?.oauthAvatarUrl) {
                const url = pb.files.getUrl(user, user.avatar);
                setAvatarPreview(url);
            }
        }

        return () => {
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }
        };
    }, [user, stream]);

    const stopStream = () => {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
        }
    };

    const startCamera = async () => {
        if (previewObjectUrl.current) {
            URL.revokeObjectURL(previewObjectUrl.current);
            previewObjectUrl.current = null;
        }
        setAvatarPreview(null);
        setAvatarFile(null);
        setGoogleAvatarUrl(null);
        setAvatarRemoved(true);

        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err) {
            console.warn('Camera access denied or not available', err);
            showToast('Não foi possível aceder à câmara', 'error');
        }
    };

    useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (previewObjectUrl.current) {
                URL.revokeObjectURL(previewObjectUrl.current);
                previewObjectUrl.current = null;
            }
            setAvatarFile(file);
            const preview = URL.createObjectURL(file);
            previewObjectUrl.current = preview;
            setAvatarPreview(preview);
            setAvatarRemoved(false);
            setGoogleAvatarUrl(null);
            stopStream();
        }
    };

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d');
            if (context) {
                canvasRef.current.width = videoRef.current.videoWidth;
                canvasRef.current.height = videoRef.current.videoHeight;
                context.drawImage(
                    videoRef.current,
                    0,
                    0,
                    canvasRef.current.width,
                    canvasRef.current.height
                );

                canvasRef.current.toBlob((blob) => {
                    if (blob) {
                        if (previewObjectUrl.current) {
                            URL.revokeObjectURL(previewObjectUrl.current);
                            previewObjectUrl.current = null;
                        }
                        const file = new File([blob], 'camera-capture.png', {
                            type: 'image/png',
                        });
                        const preview = URL.createObjectURL(blob);
                        previewObjectUrl.current = preview;
                        setAvatarFile(file);
                        setAvatarPreview(preview);
                        setAvatarRemoved(false);
                        setGoogleAvatarUrl(null);
                    }
                }, 'image/png');

                stopStream();
            }
        }
    };

    const handleCancelCamera = () => {
        stopStream();
    };

    const handleRemovePhoto = () => {
        if (previewObjectUrl.current) {
            URL.revokeObjectURL(previewObjectUrl.current);
            previewObjectUrl.current = null;
        }
        setAvatarPreview(null);
        setAvatarFile(null);
        setGoogleAvatarUrl(null);
        setAvatarRemoved(true);
        stopStream();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('name', name);

            // Username automático na primeira configuração de perfil (Fase 8b)
            // — só aqui, nunca ao reeditar o nome mais tarde no Perfil.
            if (!user?.username) {
                try {
                    const res = await fetch('/api/generate-username', {
                        method: 'POST',
                        headers: authHeaders(),
                        body: JSON.stringify({ name }),
                    });
                    const data = await res.json();
                    if (data.username) formData.append('username', data.username);
                } catch {
                    // Sem username por agora — dá para gerar mais tarde (perfil/migração).
                }
            }

            let fileToUpload = avatarFile;
            if (!fileToUpload && !avatarRemoved && googleAvatarUrl) {
                fileToUpload = await urlToAvatarFile(googleAvatarUrl);
                if (!fileToUpload) {
                    showToast(
                        'Não foi possível usar a foto do Google; podes continuar sem foto.',
                        'error'
                    );
                }
            }

            if (fileToUpload) {
                formData.append('avatar', fileToUpload);
            }

            await updateProfile(formData);
            clearOAuthProfileHints();
            // Mostra o carrossel de boas-vindas antes de cair na app. Com
            // convite, o destino original segue (codificado — um `&` partia-o)
            // para o aceitar/auto-join continuar no fim do carrossel.
            nav.replace(withRedirect('/onboarding', redirect));
        } catch (error) {
            console.error(error);
            showToast('Erro ao atualizar perfil', 'error');
        } finally {
            setLoading(false);
        }
    };

    const isCameraActive = Boolean(stream) && !avatarLoading;
    const hasPhoto = Boolean(avatarPreview) && !avatarLoading;

    return (
        <AuthShell
            title="O teu perfil"
            subtitle={hasOAuthHints ? 'Confirma o teu nome. A foto é opcional.' : 'Como te chamamos nos grupos?'}
        >
            <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="flex flex-col items-center gap-4">
                    <button
                        type="button"
                        onClick={() => !isCameraActive && fileInputRef.current?.click()}
                        disabled={avatarLoading || isCameraActive}
                        className="relative w-28 h-28 rounded-full overflow-hidden bg-surface-sunken border border-hairline shadow-sm disabled:cursor-default"
                        aria-label="Escolher foto da galeria"
                    >
                        {avatarLoading ? (
                            <div className="w-full h-full flex items-center justify-center">
                                <Icon name="photo" data-decorative className="text-ink-faint animate-pulse text-3xl" />
                            </div>
                        ) : isCameraActive ? (
                            <video
                                ref={videoRef}
                                autoPlay
                                muted
                                playsInline
                                className="w-full h-full object-cover scale-x-[-1]"
                            />
                        ) : avatarPreview ? (
                            // eslint-disable-next-line @next/next/no-img-element -- blob/objeto local
                            <img
                                src={avatarPreview}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-200">
                                {name ? (
                                    <span className="font-bold text-4xl">{name[0].toUpperCase()}</span>
                                ) : (
                                    <Icon name="person" className="text-5xl" />
                                )}
                            </div>
                        )}
                    </button>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                    <canvas ref={canvasRef} className="hidden" />

                    {isCameraActive ? (
                        <div className="flex w-full gap-3">
                            <Button variant="ghost" size="sm" className="flex-1" onClick={handleCancelCamera}>
                                Cancelar
                            </Button>
                            <Button size="sm" className="flex-1" onClick={handleCapture}>
                                <Icon name="camera" className="text-lg" />
                                Capturar
                            </Button>
                        </div>
                    ) : (
                        <div className="w-full space-y-1">
                            <div className="flex w-full gap-3">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={avatarLoading}
                                >
                                    <Icon name="photo_library" className="text-lg" />
                                    Galeria
                                </Button>
                                <Button variant="secondary" size="sm" className="flex-1" onClick={startCamera} disabled={avatarLoading}>
                                    <Icon name="photo_camera" className="text-lg" />
                                    Câmara
                                </Button>
                            </div>
                            {hasPhoto && (
                                <button
                                    type="button"
                                    onClick={handleRemovePhoto}
                                    className="w-full py-2 text-sm font-medium text-ink-soft hover:text-danger transition-colors"
                                >
                                    Remover foto
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <Input
                    label="Nome"
                    id="name"
                    type="text"
                    autoComplete="name"
                    autoCapitalize="words"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Ana Silva"
                />

                <Button type="submit" size="lg" block loading={loading} disabled={!name.trim()}>
                    Continuar
                </Button>
            </form>
        </AuthShell>
    );
}
