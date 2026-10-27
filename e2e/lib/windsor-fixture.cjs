// Loaded only by the local browser harness. Not imported by application code.
const original = globalThis.fetch
if (!/@127\.0\.0\.1:55437\//.test(process.env.DATABASE_URL || '')) throw Error('Windsor fixtures require disposable local database')
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (url.hostname !== 'connectors.windsor.ai') return original(input, init)
  const key = url.searchParams.get('api_key')
  if (key !== 'local-fixture-secret-123456' && key !== 'replacement-fixture-key') return Response.json({ error: 'invalid' }, { status: 401 })
  return Response.json({ data: [{ account_name: 'Minas Farma', date: new Date().toISOString().slice(0, 10), views: 12, impressions: 20, spend: 2 }] })
}
