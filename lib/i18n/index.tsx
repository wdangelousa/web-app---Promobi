'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import ptDict from './pt.json'
import esDict from './es.json'

export type Locale = 'pt' | 'es'

type Dictionary = typeof ptDict

type LocaleContextType = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
  tArray: (key: string) => any[]
  dict: Dictionary
}

const dictionaries: Record<Locale, Dictionary> = {
  pt: ptDict,
  es: esDict,
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined)

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => {
    if (acc === undefined || acc === null) return undefined
    return acc[key]
  }, obj)
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('promobidocs-locale')
      if (saved === 'es') return 'es'
    }
    return 'pt'
  })

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    if (typeof window !== 'undefined') {
      localStorage.setItem('promobidocs-locale', newLocale)
    }
  }, [])

  const dict = dictionaries[locale]

  const t = useCallback((key: string): string => {
    const value = getNestedValue(dict, key)
    if (typeof value === 'string') return value
    const fallback = getNestedValue(dictionaries.pt, key)
    if (typeof fallback === 'string') return fallback
    return key
  }, [dict])

  const tArray = useCallback((key: string): any[] => {
    const value = getNestedValue(dict, key)
    if (Array.isArray(value)) return value
    const fallback = getNestedValue(dictionaries.pt, key)
    if (Array.isArray(fallback)) return fallback
    return []
  }, [dict])

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t, tArray, dict }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider')
  }
  return context
}
