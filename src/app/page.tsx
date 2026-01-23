'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';

export default function WelcomePage() {
  const [name, setName] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const { setUser, isLoggedIn } = useUser();
  const { showToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    // Animate in after mount
    setTimeout(() => setIsLoaded(true), 100);

    // Redirect if already logged in
    if (isLoggedIn) {
      router.push('/trips');
    }
  }, [isLoggedIn, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      setUser(name.trim());
      showToast(`Bem-vindo, ${name.trim()}! 🎉`, 'success');
      router.push('/trips');
    } else {
      showToast('Por favor, introduz o teu nome', 'error');
    }
  };

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
              <span className="text-5xl">🛒</span>
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-teal-400 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg">
              !
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Order It All!
          </h1>
          <p className="text-lg md:text-xl text-white/80 max-w-md mx-auto leading-relaxed">
            A aplicação de compras que acaba com as discussões!
          </p>
        </div>

        {/* Form Card */}
        <div
          className={`w-full max-w-md transition-all duration-700 delay-200 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <div className="bg-white/20 backdrop-blur-xl rounded-3xl p-8 border border-white/30 shadow-2xl">
            <h2 className="text-2xl font-semibold text-white mb-6 text-center">
              Vamos começar! 👋
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="relative">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="O teu nome..."
                  className="w-full px-6 py-4 bg-white/20 border-2 border-white/30 rounded-2xl text-white placeholder-white/50 text-lg font-medium focus:outline-none focus:border-white/60 focus:bg-white/30 transition-all"
                  autoFocus
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-white text-purple-600 rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
              >
                Começar a pedir! 🚀
              </button>
            </form>
          </div>
        </div>

        {/* Links */}
        <div
          className={`mt-8 flex gap-6 transition-all duration-700 delay-300 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <button
            onClick={() => router.push('/admin')}
            className="text-white/70 hover:text-white text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Admin
          </button>
          <button
            onClick={() => router.push('/splitter')}
            className="text-white/70 hover:text-white text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Divisor
          </button>
        </div>
      </div>

      {/* Footer wave */}
      <div className="h-20 relative">
        <svg className="absolute bottom-0 w-full h-20 text-white/5" preserveAspectRatio="none" viewBox="0 0 1440 74">
          <path fill="currentColor" d="M0 24C240 74 480 74 720 49C960 24 1200 24 1440 49V74H0V24Z" />
        </svg>
      </div>
    </div>
  );
}
