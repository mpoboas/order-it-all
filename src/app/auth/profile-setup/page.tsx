'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { pb } from '@/lib/pocketbase';

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

    // Camera State
    const [stream, setStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (user) {
            if (user.name) setName(user.name);
            if (user.avatar) {
                const url = pb.files.getUrl(user, user.avatar);
                setAvatarPreview(url);
            }
        }

        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [user]);

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err) {
            console.warn("Camera access denied or not available", err);
            showToast('Não foi possível aceder à câmara', 'error');
        }
    };

    // Update video ref if stream changes (e.g. after retake)
    useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
            // Stop camera if file uploaded
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                setStream(null);
            }
        }
    };

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d');
            if (context) {
                // Set canvas dimensions to match video
                canvasRef.current.width = videoRef.current.videoWidth;
                canvasRef.current.height = videoRef.current.videoHeight;

                // Draw video frame
                context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);

                // Convert to blob/file
                canvasRef.current.toBlob((blob) => {
                    if (blob) {
                        const file = new File([blob], "camera-capture.png", { type: "image/png" });
                        setAvatarFile(file);
                        setAvatarPreview(URL.createObjectURL(file));
                    }
                }, 'image/png');

                // Stop stream to save resources/battery
                if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                    setStream(null);
                }
            }
        }
    };

    const handleRetake = async () => {
        setAvatarPreview(null);
        setAvatarFile(null);
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
            setStream(mediaStream);
        } catch (err) {
            console.error("Failed to restart camera", err);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('name', name);
            if (avatarFile) {
                formData.append('avatar', avatarFile);
            }

            await updateProfile(formData);
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

    return (
        <div className="min-h-screen gradient-mesh flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Decorative elements */}
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
                        Quase lá! Diz-nos como te tratar.
                    </p>
                </div>

                <form className="space-y-6" onSubmit={handleSubmit}>

                    {/* Avatar Section */}
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative group w-32 h-32">
                            <div className="w-32 h-32 rounded-full overflow-hidden bg-white/10 ring-4 ring-white/30 shadow-lg flex items-center justify-center relative bg-black/50 backdrop-blur-sm">
                                {avatarPreview ? (
                                    <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                                ) : stream ? (
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        muted
                                        playsInline
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-5xl">
                                        {name ? <span className="text-white font-bold">{name[0].toUpperCase()}</span> : '👤'}
                                    </div>
                                )}
                            </div>
                        </div>

                        <canvas ref={canvasRef} className="hidden" />

                        <div className="flex flex-col items-center gap-3 w-full">
                            {!avatarPreview && !stream && (
                                <button
                                    type="button"
                                    onClick={startCamera}
                                    className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-full font-medium transition-all text-sm border border-white/30"
                                >
                                    <span className="material-icons text-lg">photo_camera</span>
                                    <span>Ativar Câmara</span>
                                </button>
                            )}

                            {!avatarPreview && stream && (
                                <button
                                    type="button"
                                    onClick={handleCapture}
                                    className="flex items-center gap-2 px-6 py-2 bg-white text-violet-600 rounded-full font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                                >
                                    <span className="material-icons">camera</span>
                                    <span>Capturar</span>
                                </button>
                            )}

                            {avatarPreview && (
                                <button
                                    type="button"
                                    onClick={handleRetake}
                                    className="text-sm text-white/90 hover:text-white font-medium hover:underline"
                                >
                                    Tirar outra foto
                                </button>
                            )}

                            <label className="cursor-pointer text-xs text-white/60 hover:text-white hover:underline mt-1 transition-colors">
                                Ou carrega da galeria
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />
                            </label>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-white/90 mb-1">
                            Nome de Exibição
                        </label>
                        <input
                            id="name"
                            type="text"
                            required
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Ex: Habelius Chabierius"
                            className="appearance-none block w-full px-4 py-3 bg-white/80 border border-white/30 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/50 focus:bg-white transition-all shadow-sm backdrop-blur-sm"
                        />
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center py-3.5 px-4 bg-white text-violet-600 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/50 transform active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? 'A guardar...' : 'Concluir'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
