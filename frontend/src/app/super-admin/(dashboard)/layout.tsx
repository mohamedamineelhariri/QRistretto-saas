"use client";

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
    LayoutDashboard, 
    Building2, 
    CreditCard, 
    LogOut,
    ShieldAlert
} from 'lucide-react';

export default function SuperAdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const [isAuthorized, setIsAuthorized] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('super_admin_token');
        if (!token) {
            router.push('/super-admin/login');
        } else {
            setIsAuthorized(true);
        }
    }, [router]);

    if (!isAuthorized) return null;

    const handleLogout = () => {
        localStorage.removeItem('super_admin_token');
        router.push('/super-admin/login');
    };

    const navItems = [
        { href: '/super-admin', icon: LayoutDashboard, label: 'Analytics' },
        { href: '/super-admin/tenants', icon: Building2, label: 'Tenants' },
        { href: '/super-admin/plans', icon: CreditCard, label: 'Plans' },
    ];

    return (
        <div className="min-h-screen bg-stone-950 flex flex-col md:flex-row">
            {/* Sidebar */}
            <aside className="w-full md:w-64 bg-stone-900 border-r border-stone-800 flex flex-col">
                <div className="p-6 border-b border-stone-800 flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center border border-red-500/20">
                        <ShieldAlert className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                        <h1 className="text-white font-bold leading-none">QRistretto</h1>
                        <span className="text-xs text-red-400 font-medium">Platform Admin</span>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-x-auto md:overflow-visible flex md:block gap-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors whitespace-nowrap ${
                                    isActive 
                                    ? 'bg-red-500/10 text-red-400' 
                                    : 'text-stone-400 hover:text-white hover:bg-stone-800/50'
                                }`}
                            >
                                <item.icon className="w-5 h-5" />
                                <span className="font-medium">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-stone-800 mt-auto">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-3 w-full text-stone-400 hover:text-white hover:bg-stone-800/50 rounded-xl transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        <span className="font-medium">Sign Out</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto w-full">
                <div className="p-4 md:p-8 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
