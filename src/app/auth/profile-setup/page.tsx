'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { pb } from '@/lib/pocketbase';
import {
    clearOAuthProfileHints,
    loadOAuthProfileHints,
    loadGoogleAvatarFromUrl,
    urlToAvatarFile,
} from '@/lib/googleAuth';

export default function ProfileSetupPage() {
    const { user, updateProfile } = useUser();
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = searchParams.get('redirect');
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
            showToast('Perfil configurado!', 'success');
            if (redirect) {
                router.push(redirect);
            } else {
                router.push('/groups');
            }
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
        <div className="min-h-screen gradient-mesh flex flex-col items-center justify-center p-4 relative overflow-hidden safe-screen">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-300/20 rounded-full blur-3xl" />
            </div>

            <div className="w-full max-w-md bg-white/20 backdrop-blur-xl rounded-3xl p-8 border border-white/30 shadow-2xl relative z-10 animate-fade-in-up">
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-white mb-2">
                        Configurar Perfil
                    </h2>
                    <p className="text-white/80 text-sm">
                        {hasOAuthHints
                            ? 'Escolhe o teu nome. A foto é opcional.'
                            : 'Como te chamamos nos grupos?'}
                    </p>
                </div>

                <form className="space-y-6" onSubmit={handleSubmit}>
                    <div className="flex flex-col items-center gap-5">
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => !isCameraActive && fileInputRef.current?.click()}
                                disabled={avatarLoading || isCameraActive}
                                className="relative w-28 h-28 rounded-full overflow-hidden ring-4 ring-white/30 shadow-lg bg-white/10 disabled:cursor-default"
                                aria-label="Escolher foto da galeria"
                            >
                                {avatarLoading ? (
                                    <div className="w-full h-full flex items-center justify-center bg-black/40">
                                        <span className="material-icons text-white/70 animate-pulse text-3xl">
                                            photo
                                        </span>
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
                                    <img
                                        src={avatarPreview}
                                        alt=""
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-500/80 to-indigo-600/80">
                                        {name ? (
                                            <span className="text-white font-bold text-4xl">
                                                {name[0].toUpperCase()}
                                            </span>
                                        ) : (
                                            <span className="material-icons text-white/80 text-5xl">
                                                person
                                            </span>
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
                        </div>

                        <canvas ref={canvasRef} className="hidden" />

                        {isCameraActive ? (
                            <div className="flex w-full gap-3">
                                <button
                                    type="button"
                                    onClick={handleCancelCamera}
                                    className="flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold text-white/90 bg-white/10 border border-white/25 hover:bg-white/20 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCapture}
                                    className="flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold text-violet-600 bg-white hover:bg-gray-50 shadow-md transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <span className="material-icons text-lg">camera</span>
                                    Capturar
                                </button>
                            </div>
                        ) : (
                            <div className="w-full space-y-2">
                                <div className="flex w-full gap-3">
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={avatarLoading}
                                        className="flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold text-white bg-white/15 border border-white/25 hover:bg-white/25 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
                                    >
                                        <span className="material-icons text-lg">photo_library</span>
                                        Galeria
                                    </button>
                                    <button
                                        type="button"
                                        onClick={startCamera}
                                        disabled={avatarLoading}
                                        className="flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold text-white bg-white/15 border border-white/25 hover:bg-white/25 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
                                    >
                                        <span className="material-icons text-lg">photo_camera</span>
                                        Câmara
                                    </button>
                                </div>

                                {hasPhoto && (
                                    <button
                                        type="button"
                                        onClick={handleRemovePhoto}
                                        className="w-full py-2 text-sm font-medium text-white/60 hover:text-red-200 transition-colors"
                                    >
                                        Remover foto
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div>
                        <label
                            htmlFor="name"
                            className="block text-sm font-medium text-white/90 mb-1"
                        >
                            Nome
                        </label>
                        <input
                            id="name"
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: Habelius Chabierius"
                            className="appearance-none block w-full px-4 py-3 bg-white/80 border border-white/30 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/50 focus:bg-white transition shadow-sm backdrop-blur-sm"
                        />
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center py-3.5 px-4 bg-white text-violet-600 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/50 transform active:scale-[0.98] transition disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? 'A guardar...' : 'Concluir'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
