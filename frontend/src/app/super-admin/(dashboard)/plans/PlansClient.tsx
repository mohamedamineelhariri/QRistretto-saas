'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { CheckCircle2, Crown, Zap, AlertCircle } from 'lucide-react';

export default function PlansClient() {
    const [plans, setPlans] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchPlans();
    }, []);

    const fetchPlans = async () => {
        try {
            const res = await api.getPlans();
            if (res.success) {
                setPlans(res.data?.plans || []);
            }
        } catch (error) {
            console.error('Failed to load plans:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Subscription Plans</h1>
                    <p className="text-stone-400">Manage SaaS tiers, pricing, and feature constraints.</p>
                </div>
                <button className="bg-white text-stone-950 px-4 py-2 rounded-xl font-semibold hover:bg-stone-200 transition-colors">
                    + New Plan
                </button>
            </div>

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="animate-pulse bg-stone-900 border border-stone-800 rounded-2xl h-[400px]"></div>
                    ))}
                </div>
            ) : plans.length === 0 ? (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-6 rounded-2xl flex items-center gap-4">
                    <AlertCircle className="w-6 h-6" />
                    <div>
                        <h3 className="font-bold">No plans configured in database</h3>
                        <p className="text-sm opacity-80 mt-1">Run <code className="bg-black/20 px-1 rounded">node prisma/seed.js</code> on the backend to populate the STARTER, PRO, and ENTERPRISE plans.</p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {plans.map((plan) => {
                        const isEnterprise = plan.name === 'ENTERPRISE';
                        const isPro = plan.name === 'PRO';
                        
                        return (
                            <div 
                                key={plan.id} 
                                className={`relative bg-stone-900 border ${
                                    isEnterprise ? 'border-amber-500/50 shadow-lg shadow-amber-500/10' 
                                    : isPro ? 'border-red-500/50 shadow-lg shadow-red-500/10'
                                    : 'border-stone-800'
                                } rounded-3xl p-8 flex flex-col`}
                            >
                                {isEnterprise && (
                                    <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 bg-amber-500 text-stone-950 font-bold text-xs uppercase tracking-wider py-1 px-3 rounded-full flex items-center gap-1">
                                        <Crown className="w-3 h-3" /> Highest Tier
                                    </div>
                                )}
                                {isPro && (
                                    <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 bg-red-500 text-white font-bold text-xs uppercase tracking-wider py-1 px-3 rounded-full flex items-center gap-1">
                                        <Zap className="w-3 h-3" /> Popular
                                    </div>
                                )}
                                
                                <div className="mb-6">
                                    <h3 className="text-xl font-bold text-white mb-2">{plan.displayName}</h3>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-4xl font-extrabold text-white">{(plan.priceMAD / 100).toLocaleString()}</span>
                                        <span className="text-stone-400 font-medium">MAD / mo</span>
                                    </div>
                                </div>
                                
                                <div className="space-y-4 mb-8 flex-1">
                                    <div className="text-sm font-medium text-stone-300 pb-2 border-b border-stone-800">Limits</div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-stone-400">Orders/Day</span>
                                        <span className="text-white font-medium">{plan.maxOrdersPerDay === null ? 'Unlimited' : plan.maxOrdersPerDay}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-stone-400">Locations</span>
                                        <span className="text-white font-medium">{plan.maxLocations === null ? 'Unlimited' : plan.maxLocations}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-stone-400">Staff Accounts</span>
                                        <span className="text-white font-medium">{plan.maxStaff === null ? 'Unlimited' : plan.maxStaff}</span>
                                    </div>
                                    
                                    <div className="text-sm font-medium text-stone-300 pb-2 border-b border-stone-800 pt-4">Features</div>
                                    <ul className="space-y-3">
                                        {(plan.features as string[] || []).map((feature: string, idx: number) => (
                                            <li key={idx} className="flex gap-3 text-sm text-stone-300">
                                                <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${isEnterprise ? 'text-amber-500' : isPro ? 'text-red-500' : 'text-stone-600'}`} />
                                                <span className="capitalize">{feature.replace(/_/g, ' ')}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                
                                <button className={`w-full py-3 rounded-xl font-semibold transition-colors ${
                                    isEnterprise ? 'bg-amber-500 hover:bg-amber-600 text-stone-950'
                                    : isPro ? 'bg-red-500 hover:bg-red-600 text-white'
                                    : 'bg-stone-800 hover:bg-stone-700 text-white'
                                }`}>
                                    Edit Tier
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
