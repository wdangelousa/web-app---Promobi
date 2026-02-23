import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return request.cookies.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value,
                        ...options,
                    })
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    response.cookies.set({
                        name,
                        value,
                        ...options,
                    })
                },
                remove(name: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value: '',
                        ...options,
                    })
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    response.cookies.set({
                        name,
                        value: '',
                        ...options,
                    })
                },
            },
        }
    )

    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Consider session valid if user exists
    const isAuthenticated = !!user;

    const pathname = request.nextUrl.pathname

    // 1. PUBLIC ROUTES (LIVRES)
    // Matches: /, /api/auth/callback, /pay, /proposta and public assets (handled by matcher)
    if (pathname === '/' || pathname.startsWith('/api/auth') || pathname.startsWith('/pay') || pathname.startsWith('/proposta')) {
        return response
    }

    // 2. ADMIN PROTECTION
    if (pathname.startsWith('/admin')) {
        if (!isAuthenticated) {
            // Se deslogado: redirecione para /login
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/login'
            // Keep original URL as a param to redirect back after login if needed
            // redirectUrl.searchParams.set('redirectedFrom', pathname)
            return NextResponse.redirect(redirectUrl)
        }
    }

    // 3. LOGIN PAGE REDIRECT
    if (pathname === '/login') {
        if (isAuthenticated) {
            // Se logado: redirecione IMEDIATAMENTE para /admin/dashboard
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/admin/dashboard'
            return NextResponse.redirect(redirectUrl)
        }
    }

    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public images and assets (png, jpg, etc)
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
