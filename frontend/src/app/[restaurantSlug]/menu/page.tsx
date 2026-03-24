import MenuPageClient from './MenuPageClient';

export function generateStaticParams() {
    return [{ restaurantSlug: 'cafe-demo-dev' }];
}

export const dynamicParams = false;

export default function MenuPage({ params }: { params: { restaurantSlug: string } }) {

    return <MenuPageClient params={params} />;
}
