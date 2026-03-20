'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Command, Activity, Users, Settings, LayoutDashboard, CreditCard, MessageSquare, Briefcase, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SearchItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  category: 'Menu' | 'Funcionalidades' | 'Configurações';
}

const SEARCH_ITEMS: SearchItem[] = [
  { id: 'dashboard', title: 'Dashboard', description: 'Visão geral do sistema', icon: <LayoutDashboard className="w-4 h-4" />, path: '/admin', category: 'Menu' },
  { id: 'kanban', title: 'Kanban', description: 'Gerenciar fluxo de pedidos', icon: <Activity className="w-4 h-4" />, path: '/admin', category: 'Funcionalidades' },
  { id: 'clientes', title: 'Clientes', description: 'Base de dados de clientes', icon: <Users className="w-4 h-4" />, path: '/admin/clientes', category: 'Menu' },
  { id: 'pagamentos', title: 'Pagamentos', description: 'Histórico e status de cobrança', icon: <CreditCard className="w-4 h-4" />, path: '/admin/pagamentos', category: 'Menu' },
  { id: 'marketing', title: 'Marketing', description: 'Campanhas e automações', icon: <MessageSquare className="w-4 h-4" />, path: '/admin/marketing', category: 'Menu' },
  { id: 'vagas', title: 'Vagas', description: 'Gestão de oportunidades', icon: <Briefcase className="w-4 h-4" />, path: '/admin/vagas', category: 'Menu' },
  { id: 'configuracoes', title: 'Configurações', description: 'Ajustes do sistema', icon: <Settings className="w-4 h-4" />, path: '/admin/settings', category: 'Configurações' },
  { id: 'relatorios', title: 'Relatórios', description: 'Análises e exportação de dados', icon: <FileText className="w-4 h-4" />, path: '/admin/reports', category: 'Funcionalidades' },
];

export const SearchBar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (query.trim() === '') {
      setResults([]);
      return;
    }

    const filtered = SEARCH_ITEMS.filter(item => 
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.description.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase())
    );
    setResults(filtered.slice(0, 5));
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setIsOpen(true);
      }
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSelect = (item: SearchItem) => {
    router.push(item.path);
    setIsOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      setSelectedIndex(prev => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter' && results.length > 0) {
      handleSelect(results[selectedIndex]);
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        onClick={() => setIsOpen(true)}
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-xl border border-gray-200 bg-white/50 backdrop-blur-sm cursor-pointer transition-all duration-200",
          "hover:border-blue-400 hover:ring-4 hover:ring-blue-50 group",
          isOpen && "border-blue-500 ring-4 ring-blue-50"
        )}
      >
        <Search className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
        <span className="text-sm text-gray-500 flex-1">Buscar funcionalidade...</span>
        <div className="hidden md:flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-[10px] font-medium text-gray-400">
          <Command className="w-2.5 h-2.5" />
          <span>K</span>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
          >
            <div className="p-2 border-b border-gray-100 flex items-center gap-3">
              <Search className="w-4 h-4 text-gray-400 ml-2" />
              <input
                autoFocus
                placeholder="O que você está procurando?"
                className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-gray-400"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
              />
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="max-h-[320px] overflow-y-auto p-2">
              {query === '' ? (
                <div className="p-4 text-center">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4 px-2 text-left">Sugestões Rápidas</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SEARCH_ITEMS.slice(0, 4).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="p-2 rounded-lg bg-blue-50 text-blue-500">
                          {item.icon}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-700">{item.title}</p>
                          <p className="text-[10px] text-gray-400">{item.category}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : results.length > 0 ? (
                <div className="space-y-1">
                  {results.map((item, index) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={cn(
                        "w-full flex items-center gap-4 p-3 rounded-xl transition-all duration-200 text-left",
                        index === selectedIndex ? "bg-blue-50 translate-x-1" : "hover:bg-gray-50"
                      )}
                    >
                      <div className={cn(
                        "p-2 rounded-lg transition-colors",
                        index === selectedIndex ? "bg-blue-500 text-white shadow-lg shadow-blue-200" : "bg-gray-100 text-gray-400"
                      )}>
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn(
                            "text-sm font-semibold truncate",
                            index === selectedIndex ? "text-blue-700" : "text-gray-700"
                          )}>{item.title}</p>
                          <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded uppercase">{item.category}</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{item.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Search className="w-6 h-6 text-gray-300" />
                  </div>
                  <p className="text-sm text-gray-500">Nenhum resultado encontrado para <span className="font-semibold text-gray-900">"{query}"</span></p>
                </div>
              )}
            </div>

            <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 font-medium">
              <div className="flex items-center gap-3">
                 <span className="flex items-center gap-1"><Command className="w-2.5 h-2.5" /> + Enter para selecionar</span>
                 <span className="flex items-center gap-1">↑↓ para navegar</span>
              </div>
              <span>{SEARCH_ITEMS.length} itens indexados</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
