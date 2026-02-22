import prisma from '@/lib/prisma';
import { Users, Mail, Phone, Calendar } from 'lucide-react';
import { SearchCustomers } from '@/components/SearchCustomers';

export const dynamic = 'force-dynamic';

export default async function CustomersPage({
    searchParams,
}: {
    searchParams: Promise<{ search?: string }>;
}) {
    const { search } = await searchParams; // Await searchParams properly in Next.js 15+

    const users = await prisma.user.findMany({
        where: {
            fullName: {
                contains: search,
                mode: 'insensitive', // Case-insensitive range search
            },
            role: 'CLIENT', // Optionally filter only clients
        },
        orderBy: {
            createdAt: 'desc',
        },
    });

    const formatDate = (date: Date) => {
        return new Intl.DateTimeFormat('en-US', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        }).format(date);
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Base de Clientes</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Visualizando {users.length} clientes
                    </p>
                </div>
                <SearchCustomers />
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-4 font-medium">Nome Completo</th>
                                <th className="px-6 py-4 font-medium">E-mail</th>
                                <th className="px-6 py-4 font-medium">Telefone</th>
                                <th className="px-6 py-4 font-medium">Data de Cadastro</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-gray-900">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                                                <Users className="w-4 h-4" />
                                            </div>
                                            {user.fullName}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        <div className="flex items-center gap-2">
                                            <Mail className="w-3.5 h-3.5 text-gray-400" />
                                            {user.email}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        <div className="flex items-center gap-2">
                                            {user.phone ? (
                                                <>
                                                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                                                    {user.phone}
                                                </>
                                            ) : (
                                                <span className="text-gray-400 italic">Não informado</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-500">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                            {formatDate(user.createdAt)}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {users.length === 0 && (
                    <div className="p-12 text-center text-gray-500 bg-gray-50 bg-opacity-50">
                        <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-gray-900">Nenhum cliente encontrado</h3>
                        <p>Tente buscar por outro nome.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
