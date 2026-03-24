import QRPageClient from './QRPageClient';

export function generateStaticParams() {
    return [{ restaurantSlug: 'cafe-demo-dev' }];
}

export default function QRPage({ params }: { params: { restaurantSlug: string } }) {

    return <QRPageClient params={params} />;
}
