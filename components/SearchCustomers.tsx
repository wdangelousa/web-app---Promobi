'use client';

import { Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useDebouncedCallback } from 'use-debounce';

export function SearchCustomers() {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { replace } = useRouter();

    const handleSearch = useDebouncedCallback((term: string) => {
        const params = new URLSearchParams(searchParams);
        if (term) {
            params.set('search', term);
        } else {
            params.delete('search');
        }
        replace(`${pathname}?${params.toString()}`);
    }, 300);

    return (
        <div className="relative flex-1 md:w-64 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <input
                className="w-full rounded-md border border-gray-200 py-2 pl-9 pr-4 text-sm outline-2 placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500"
                placeholder="Buscar por nome..."
                onChange={(e) => handleSearch(e.target.value)}
                defaultValue={searchParams.get('search')?.toString()}
            />
        </div>
    );
}
