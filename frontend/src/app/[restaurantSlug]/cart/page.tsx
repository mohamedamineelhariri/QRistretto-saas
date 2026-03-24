import CartPageClient from './CartPageClient';

export function generateStaticParams() {
    return [{ restaurantSlug: 'cafe-demo-dev' }];
}

export const dynamicParams = false;

export default function CartPage({ params }: { params: { restaurantSlug: string } }) {

    return <CartPageClient params={params} />;
}
