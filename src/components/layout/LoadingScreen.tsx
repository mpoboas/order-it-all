import React from 'react';

export function LoadingScreen() {
    return (
        <div className="fixed inset-0 bg-gradient-to-r from-primary-500 via-primary-500 to-primary-600 flex items-center justify-center z-50">
            <div className="text-center text-white">
                <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="mt-6 text-xl font-light">A carregar Order It All!</p>
            </div>
        </div>
    );
}

export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
    const sizes = {
        sm: 'w-4 h-4 border-2',
        md: 'w-8 h-8 border-3',
        lg: 'w-12 h-12 border-4',
    };

    return (
        <div className={`${sizes[size]} border-primary-500 border-t-transparent rounded-full animate-spin`} />
    );
}
