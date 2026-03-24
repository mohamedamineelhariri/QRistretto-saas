// Server component - exports generateStaticParams for static export compatibility
import OrderPageClient from './OrderPageClient';

// Required for `output: 'export'` in next.config.js
// We provide a dummy param to satisfy the build system; actual values are resolved client-side.
export function generateStaticParams() {
    return [{ restaurantSlug: 'cafe-demo-dev', id: 'latest' }];
}

// Ensure Next.js doesn't try to generate other params at build time
export const dynamicParams = false;


export default function OrderPage() {
    return <OrderPageClient />;
}
