import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
    const res = NextResponse.next()
    constsupabase = createMiddlewareClient({ req, res })

    const {
        data: { session },
    } = await supabase.auth.getSession()

    // Se o usuário tentar acessar a área administrativa sem estar logado
    if (req.nextUrl.pathname.startsWith('/admin')) {
        if (!session) {
            return NextResponse.redirect(new URL('/login', req.url))
        }
    }

    // Se o usuário estiver logado e tentar acessar o login, redirecionar para o admin
    if (req.nextUrl.pathname === '/login') {
        if (session) {
            return NextResponse.redirect(new URL('/admin/dashboard', req.url))
        }
    }

    return res
}

export const config = {
    matcher: ['/admin/:path*', '/login'],
}
