import { NextResponse, type NextRequest } from 'next/server';
import { resolvePublicPresentation } from '@/lib/public-presentation/read';

export async function proxy(request: NextRequest) {
  const deny = () => new NextResponse('Página não encontrada.', { status: 404, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  const match = /^\/apresentacao\/([A-Za-z0-9_-]{43})\/?$/.exec(request.nextUrl.pathname);
  if (!match) return deny();
  if (!['GET', 'HEAD'].includes(request.method))
    return new NextResponse(null, { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } });
  try {
    if (!(await resolvePublicPresentation(match[1]))) return deny();
  } catch {
    return new NextResponse('Apresentação temporariamente indisponível.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  response.headers.set('CDN-Cache-Control', 'no-store');
  response.headers.set('Vercel-CDN-Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}
export const config = { matcher: '/apresentacao/:path*' };
