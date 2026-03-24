"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { ShieldAlert, KeyRound, Mail, Loader2 } from 'lucide-react';

export default function SuperAdminLoginClient() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await api.superAdminLogin(email, password);
            if (res.success) {
                router.push('/super-admin');
            } else {
                setError(res.message || 'Authentication failed');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to authenticate');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-stone-900 border border-stone-800 rounded-2xl p-8 shadow-2xl">
                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20">
                        <ShieldAlert className="w-8 h-8 text-red-500" />
                    </div>
                </div>

                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Platform Access</h1>
                    <p className="text-stone-400">Restricted Area. Authorized personnel only.</p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
                        <p className="text-sm text-red-400 text-center font-medium">{error}</p>
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-stone-300">Admin Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-colors"
                                placeholder="sysadmin@qristretto.com"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-stone-300">Authentication Token</label>
                        <div className="relative">
                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-colors font-mono"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl py-3 px-4 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center h-[52px] mt-6"
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Authenticate'}
                    </button>
                    
                    <p className="text-center text-xs text-stone-600 mt-6 mt-4">
                        All access attempts are logged and monitored.
                    </p>
                </form>
            </div>
        </div>
    );
}
