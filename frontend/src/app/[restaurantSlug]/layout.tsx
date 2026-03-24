import ClientLayout from './ClientLayout';

// Required for `output: 'export'` in next.config.js
export function generateStaticParams() {
    return [{ restaurantSlug: 'cafe-demo-dev' }];
}


// Ensure Next.js doesn't try to generate other params at build time during static export
export const dynamicParams = false;


export default function RestaurantLayoutServer({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { restaurantSlug: string };
}) {
  return <ClientLayout params={params}>{children}</ClientLayout>;
}
