'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { pb } from '@/lib/pocketbase';

export default function ProfileSetupPage() {
    const { user, updateProfile } = useUser();
    const router = useRouter();
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
        let hasExistingAvatar = false;
        if (user) {
            if (user.name) setName(user.name);
            if (user.avatar) {
                const url = pb.files.getUrl(user, user.avatar);
                setAvatarPreview(url);
                hasExistingAvatar = true;
            }
        }

        // Start Camera Logic
        const startCamera = async () => {
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
                setStream(mediaStream);
                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                }
            } catch (err) {
                console.warn("Camera access denied or not available", err);
            }
        };

        // Only start camera if we don't have a preview yet
        if (!hasExistingAvatar && !avatarPreview) {
            startCamera();
        }

        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [user]);

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
            router.push('/groups');
        } catch (error) {
            console.error(error);
            showToast('Erro ao atualizar perfil', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                    Configurar Perfil
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Quase lá! Diz-nos como te tratar.
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
                    <form className="space-y-6" onSubmit={handleSubmit}>

                        {/* Avatar Section */}
                        <div className="flex flex-col items-center gap-4">
                            <div className="relative group w-32 h-32">
                                <div className="w-32 h-32 rounded-full overflow-hidden bg-gray-100 ring-4 ring-white shadow-lg flex items-center justify-center relative bg-black">
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
                                        <div className="w-full h-full flex items-center justify-center text-4xl bg-violet-100 text-violet-600">
                                            {name ? name[0].toUpperCase() : '👤'}
                                        </div>
                                    )}
                                </div>

                                {/* Capture Controls Overlaid if necessary, or below */}
                            </div>

                            <canvas ref={canvasRef} className="hidden" />

                            <div className="flex flex-col items-center gap-2">
                                {!avatarPreview && stream && (
                                    <button
                                        type="button"
                                        onClick={handleCapture}
                                        className="inline-flex items-center gap-2 px-4 py-2 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        Capturar Foto
                                    </button>
                                )}

                                {avatarPreview && (
                                    <button
                                        type="button"
                                        onClick={handleRetake}
                                        className="text-sm text-violet-600 hover:text-violet-500 font-medium"
                                    >
                                        Repetir Foto
                                    </button>
                                )}

                                <label className="cursor-pointer text-xs text-gray-400 hover:text-gray-600 hover:underline mt-2">
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
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                                Nome de Exibição
                            </label>
                            <div className="mt-1">
                                <input
                                    id="name"
                                    type="text"
                                    required
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Ex: Habelius Chabierius"
                                    className="appearance-none block w-full px-3 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-violet-500 focus:border-violet-500 sm:text-sm transition-shadow"
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                {loading ? 'A guardar...' : 'Concluir'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
