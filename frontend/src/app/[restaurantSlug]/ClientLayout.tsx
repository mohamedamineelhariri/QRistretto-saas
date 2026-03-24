'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Store, Loader2 } from 'lucide-react';
import { TenantContextType, TenantContext } from './context';

import { api } from '@/lib/api';

export default function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { restaurantSlug: string };
}) {
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantContextType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initTenant() {
      try {
        setLoading(true);
        setError(null);
        
        // Resolve slug to get tenant IDs
        const response = await api.resolveSlug(params.restaurantSlug);
        if (response.success && response.data) {
          setTenant(response.data);
        } else {
          setError('Restaurant not found');
        }
      } catch (err) {
        console.error('Failed to resolve tenant slug:', err);
        setError('Restaurant not found or inactive');
      } finally {
        setLoading(false);
      }
    }

    if (params.restaurantSlug) {
      initTenant();
    }
  }, [params.restaurantSlug]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text">
        <Loader2 className="w-8 h-8 animate-spin text-accent mb-4" />
        <p className="text-light-muted dark:text-dark-muted animate-pulse">Loading restaurant...</p>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text p-6 text-center">
        <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-6">
          <Store className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-bold mb-4">Restaurant Not Found</h1>
        <p className="text-light-muted dark:text-dark-muted mb-8 max-w-md">
          The link you followed may be broken, or the restaurant is no longer active on our platform.
        </p>
        <button
          onClick={() => router.push('/')}
          className="btn-primary py-3 px-8 rounded-full"
        >
          Return to Home
        </button>
      </div>
    );
  }

  return (
    <TenantContext.Provider value={tenant}>
      {children}
    </TenantContext.Provider>
  );
}
