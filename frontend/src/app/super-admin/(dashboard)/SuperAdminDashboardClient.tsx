"use client";

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { 
    Building2, 
    CircleDollarSign, 
    Activity, 
    ShoppingBag,
    TrendingUp
} from 'lucide-react';

export default function SuperAdminDashboardClient() {
    const [stats, setStats] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchAnalytics();
    }, []);

    const fetchAnalytics = async () => {
        try {
            const res = await api.getPlatformAnalytics();
            if (res.success) {
                setStats(res.data);
            }
        } catch (error) {
            console.error('Failed to load analytics', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return <div className="animate-pulse bg-stone-900 h-64 rounded-2xl border border-stone-800"></div>;
    }

    const cards = [
        {
            title: "Total Tenants",
            value: stats?.totalTenants || 0,
            icon: Building2,
            color: "text-blue-500",
            bg: "bg-blue-500/10",
            border: "border-blue-500/20"
        },
        {
            title: "Active Subscriptions",
            value: stats?.activeTenants || 0,
            icon: Activity,
            color: "text-emerald-500",
            bg: "bg-emerald-500/10",
            border: "border-emerald-500/20"
        },
        {
            title: "Monthly Recurring Revenue",
            value: `${(stats?.totalMRR || 0).toLocaleString()} MAD`,
            icon: CircleDollarSign,
            color: "text-amber-500",
            bg: "bg-amber-500/10",
            border: "border-amber-500/20"
        },
        {
            title: "Daily Orders Across Network",
            value: stats?.dailyOrders || 0,
            icon: ShoppingBag,
            color: "text-purple-500",
            bg: "bg-purple-500/10",
            border: "border-purple-500/20"
        }
    ];

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Platform Overview</h1>
                <p className="text-stone-400">High-level analytics across the entire QRistretto SaaS.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {cards.map((card, i) => (
                    <div key={i} className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <div className={`p-3 rounded-xl border ${card.bg} ${card.border}`}>
                                <card.icon className={`w-6 h-6 ${card.color}`} />
                            </div>
                            <span className="flex items-center text-emerald-500 text-sm font-medium">
                                <TrendingUp className="w-4 h-4 mr-1" />
                                +0%
                            </span>
                        </div>
                        <h3 className="text-stone-400 font-medium text-sm mb-1">{card.title}</h3>
                        <div className="text-3xl font-bold text-white">{card.value}</div>
                    </div>
                ))}
            </div>
            
            <div className="grid lg:grid-cols-2 gap-8">
                <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 min-h-[400px]">
                    <h2 className="text-lg font-bold text-white mb-6">Recent Tenant Signups</h2>
                    <div className="flex flex-col items-center justify-center h-full text-stone-500">
                        <Building2 className="w-12 h-12 mb-4 opacity-50" />
                        <p>No recent signups to display.</p>
                    </div>
                </div>
                
                <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 min-h-[400px]">
                    <h2 className="text-lg font-bold text-white mb-6">System Health Tracker</h2>
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-stone-300">WhatsApp Engine Nodes</span>
                                <span className="text-emerald-500 font-medium">Operational</span>
                            </div>
                            <div className="w-full bg-stone-800 rounded-full h-2">
                                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '100%' }}></div>
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-stone-300">Redis Database Load</span>
                                <span className="text-stone-400 font-medium">23%</span>
                            </div>
                            <div className="w-full bg-stone-800 rounded-full h-2">
                                <div className="bg-stone-500 h-2 rounded-full" style={{ width: '23%' }}></div>
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-stone-300">BullMQ Background Workers</span>
                                <span className="text-emerald-500 font-medium">Operational</span>
                            </div>
                            <div className="w-full bg-stone-800 rounded-full h-2">
                                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '100%' }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
