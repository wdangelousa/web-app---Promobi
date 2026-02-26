// components/admin/Avatar.tsx
// Circular avatar: shows profile image if available, otherwise styled initials.

'use client'

type Size = 'xs' | 'sm' | 'md' | 'lg'

type AvatarProps = {
    name: string
    src?: string | null
    size?: Size
    className?: string
}

const SIZE: Record<Size, string> = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-base',
}

const PALETTE = [
    'bg-orange-100 text-orange-700',
    'bg-blue-100   text-blue-700',
    'bg-emerald-100 text-emerald-700',
    'bg-purple-100 text-purple-700',
    'bg-pink-100   text-pink-700',
    'bg-teal-100   text-teal-700',
]

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0][0].toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function colorClass(name: string): string {
    let hash = 0
    for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i)
    return PALETTE[hash % PALETTE.length]
}

export function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
    const base = `${SIZE[size]} rounded-full shrink-0 font-bold flex items-center justify-center overflow-hidden ${className}`

    if (src) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={src}
                alt={name}
                className={`${base} object-cover`}
            />
        )
    }

    return (
        <div className={`${base} ${colorClass(name)}`} aria-label={name} title={name}>
            {initials(name)}
        </div>
    )
}
