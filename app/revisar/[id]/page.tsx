import prisma from '@/lib/prisma';
import ReviewInterface from '@/components/ReviewInterface';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function ReviewPage({ params }: PageProps) {
    const { id } = await params;
    const orderId = parseInt(id);

    if (isNaN(orderId)) {
        return notFound();
    }

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            documents: true,
        },
    });

    if (!order) {
        return notFound();
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header Personalizado */}
            <header className="bg-white shadow-sm py-4 px-6 z-20">
                <div className="max-w-7xl mx-auto flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                        #{order.id}
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">
                            Olá, confira a tradução do seu documento
                        </h1>
                        <p className="text-sm text-gray-500">
                            Pedido #{order.id} • Criado em {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                    </div>
                </div>
            </header>

            {/* Interface de Revisão */}
            <main className="flex-1">
                <ReviewInterface order={order} />
            </main>
        </div>
    );
}
