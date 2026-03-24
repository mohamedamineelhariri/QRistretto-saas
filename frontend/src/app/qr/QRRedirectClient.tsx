'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Loader2, AlertCircle } from 'lucide-react';

function QRRedirectContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const resolveLegacyLink = async () => {
            if (!token) {
                setError('No QR token found in URL.');
                return;
            }

            try {
                // Validate token to get the tenant slug
                const response = await api.validateToken(token);
                if (response.success && response.data && response.data.tenant) {
                    const slug = response.data.tenant.slug;
                    // Redirect to the new multi-tenant URL
                    router.replace(`/${slug}/qr?token=${token}`);
                } else {
                    setError('Invalid or expired QR code.');
                }
            } catch (err) {
                console.error('Failed to resolve legacy QR link:', err);
                setError('Unable to process QR code. Please try scanning again.');
            }
        };

        resolveLegacyLink();
    }, [token, router]);

    if (error) {
        return (
            <div className="max-w-md animate-in fade-in zoom-in duration-300">
                <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
                    <AlertCircle className="w-10 h-10" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">QR Code Error</h1>
                <p className="text-stone-400 mb-8">{error}</p>
                <button 
                    onClick={() => router.push('/')}
                    className="bg-stone-800 hover:bg-stone-700 text-white px-8 py-3 rounded-xl font-medium transition-colors"
                >
                    Back to Home
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-red-500 animate-spin" />
            <p className="text-stone-400 animate-pulse">Routing you to the menu...</p>
        </div>
    );
}

export default function QRRedirectClient() {
    return (
        <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6 text-center">
            <Suspense fallback={<Loader2 className="w-12 h-12 text-red-500 animate-spin" />}>
                <QRRedirectContent />
            </Suspense>
        </div>
    );
}
