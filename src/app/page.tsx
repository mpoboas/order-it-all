'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useWebHaptics } from 'web-haptics/react';

export default function WelcomePage() {
  const [isLoaded, setIsLoaded] = useState(false);
  const { isLoggedIn } = useUser();
  const router = useRouter();
  const { trigger } = useWebHaptics();

  useEffect(() => {
    // Animate in after mount
    setTimeout(() => setIsLoaded(true), 100);

    // Redirect if already logged in
    if (isLoggedIn) {
      router.push('/groups');
    }
  }, [isLoggedIn, router]);

  return (
    <div className="min-h-screen gradient-mesh flex flex-col">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-300/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-teal-300/10 rounded-full blur-3xl" />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10">
        {/* Logo and Title */}
        <div className={`text-center mb-12 transition-all duration-700 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="mb-6 relative">
            <div className="w-24 h-24 mx-auto bg-white/20 backdrop-blur-xl rounded-3xl flex items-center justify-center shadow-2xl animate-bounce-slow">
              <img
                src="/favicon.ico"
                alt="Order It All"
                className="w-16 h-16 drop-shadow-lg"
              />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Order It All!
          </h1>
          <p className="text-lg md:text-xl text-white/80 max-w-md mx-auto leading-relaxed">
            A aplicação de compras que acaba com as discussões!
          </p>
        </div>

        {/* Auth Selection Card */}
        <div
          className={`w-full max-w-md transition-all duration-700 delay-200 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <div className="bg-white/20 backdrop-blur-xl rounded-3xl p-8 border border-white/30 shadow-2xl text-center">
            <h2 className="text-2xl font-bold text-white mb-3">Bem-vindo! 👋</h2>
            <p className="text-white/80 mb-8 max-w-xs mx-auto">
              Cria uma conta para organizares as tuas compras em grupo.
            </p>

            <button
              onClick={() => { trigger(); router.push('/auth/register'); }}
              className="w-full py-4 bg-white text-purple-600 rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 mb-6"
            >
              Vamos lá! 🚀
            </button>

            <div className="text-white/70 text-sm font-medium">
              Já tens conta?
              <button
                onClick={() => { trigger(); router.push('/auth/login'); }}
                className="ml-2 text-white font-bold hover:underline focus:outline-none"
              >
                Entrar aqui
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
