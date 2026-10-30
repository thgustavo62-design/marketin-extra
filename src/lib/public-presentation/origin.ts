import 'server-only';
export function presentationOrigin() {
  const url = new URL(process.env.PUBLIC_SITE_ORIGIN || 'https://marketin-extra.vercel.app');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw Error('Origem pública inválida.');
  return url.origin;
}
