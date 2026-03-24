'use client';

import { createContext, useContext } from 'react';

export interface TenantContextType {
  tenantId: string;
  slug: string;
  businessName: string;
  businessNameFr: string | null;
  businessNameAr: string | null;
  locationId: string;
  locationName: string;
}

export const TenantContext = createContext<TenantContextType | null>(null);

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}
