'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { 
    CheckCircle2, 
    XCircle, 
    Clock, 
    Building2,
    ShieldBan,
    ExternalLink
} from 'lucide-react';

export default function TenantsClient() {
    const [tenants, setTenants] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchTenants();
    }, []);

    const fetchTenants = async () => {
        try {
            const res = await api.getTenants();
            if (res.success) {
                setTenants(res.data?.tenants || []);
            }
        } catch (error) {
            console.error('Failed to load tenants', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateStatus = async (tenantId: string, newStatus: string) => {
        try {
            const res = await api.updateTenantStatus(tenantId, newStatus);
            if (res.success) {
                setTenants(tenants.map(t => t.id === tenantId ? { ...t, status: newStatus } : t));
            }
        } catch (error) {
            console.error('Failed to update tenant status', error);
            alert('Error updating tenant status.');
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ACTIVE':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Active</span>;
            case 'PENDING_APPROVAL':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"><Clock className="w-3 h-3 mr-1" /> Pending</span>;
            case 'SUSPENDED':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20"><ShieldBan className="w-3 h-3 mr-1" /> Suspended</span>;
            case 'CHURNED':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-stone-500/10 text-stone-400 border border-stone-500/20"><XCircle className="w-3 h-3 mr-1" /> Churned</span>;
            default:
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-stone-500/10 text-stone-400 border border-stone-500/20">{status}</span>;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Tenant Management</h1>
                    <p className="text-stone-400">Review, approve, and manage platform businesses.</p>
                </div>
            </div>

            <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-stone-950/50 text-stone-400 border-b border-stone-800">
                            <tr>
                                <th className="px-6 py-4 font-medium">Business</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium">Plan</th>
                                <th className="px-6 py-4 font-medium">Owner</th>
                                <th className="px-6 py-4 font-medium">Joined</th>
                                <th className="px-6 py-4 text-right font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-800">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-stone-500">
                                        <div className="animate-pulse space-y-4">
                                            <div className="h-4 bg-stone-800 rounded w-1/4 mx-auto"></div>
                                            <div className="h-4 bg-stone-800 rounded w-1/2 mx-auto"></div>
                                        </div>
                                    </td>
                                </tr>
                            ) : tenants.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-stone-500">
                                        <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p>No tenants found.</p>
                                    </td>
                                </tr>
                            ) : (
                                tenants.map((tenant) => (
                                    <tr key={tenant.id} className="hover:bg-stone-800/20 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-stone-800 flex items-center justify-center font-bold text-white">
                                                    {tenant.businessName.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-white">{tenant.businessName}</div>
                                                    <div className="text-xs text-stone-500">/{tenant.slug}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {getStatusBadge(tenant.status)}
                                        </td>
                                        <td className="px-6 py-4 text-stone-300">
                                            {tenant.subscription?.plan?.displayName || 'TRIAL'}
                                        </td>
                                        <td className="px-6 py-4 text-stone-300">
                                            {tenant.users?.[0]?.email || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 text-stone-400">
                                            {new Date(tenant.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {tenant.status === 'PENDING_APPROVAL' ? (
                                                <div className="flex items-center justify-end gap-2">
                                                    <button 
                                                        onClick={() => handleUpdateStatus(tenant.id, 'ACTIVE')}
                                                        className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-emerald-500/0 hover:border-emerald-500/30"
                                                    >
                                                        Approve
                                                    </button>
                                                    <button 
                                                        onClick={() => handleUpdateStatus(tenant.id, 'REJECTED')}
                                                        className="text-stone-400 hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded-lg transition-colors"
                                                    >
                                                        <XCircle className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-end gap-2 text-stone-400">
                                                   {tenant.status === 'ACTIVE' && (
                                                       <button 
                                                            onClick={() => handleUpdateStatus(tenant.id, 'SUSPENDED')}
                                                            title="Suspend Tenant"
                                                            className="hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded-lg transition-colors"
                                                       >
                                                            <ShieldBan className="w-4 h-4" />
                                                       </button>
                                                   )}
                                                   {tenant.status === 'SUSPENDED' && (
                                                       <button 
                                                            onClick={() => handleUpdateStatus(tenant.id, 'ACTIVE')}
                                                            title="Unsuspend Tenant"
                                                            className="hover:text-emerald-400 hover:bg-emerald-500/10 p-1.5 rounded-lg transition-colors"
                                                       >
                                                            <CheckCircle2 className="w-4 h-4" />
                                                       </button>
                                                   )}
                                                   <button className="hover:text-white hover:bg-stone-800 p-1.5 rounded-lg transition-colors">
                                                       <ExternalLink className="w-4 h-4" />
                                                   </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
