import test from 'node:test'
import assert from 'node:assert/strict'
import { encryptionKey, openSecret, sealSecret, validWindsorKey } from '../src/lib/windsor-secret.ts'
test('Windsor: chave criptografada, IV aleatório e leitura autenticada', () => {
  const key = encryptionKey('ab'.repeat(32)), secret = 'test-key-private-123'
  const encrypted = sealSecret(secret, key)
  assert.ok(!encrypted.includes(secret))
  assert.notEqual(encrypted, sealSecret(secret, key))
  assert.equal(openSecret(encrypted, key), secret)
  assert.throws(() => openSecret(encrypted, encryptionKey('cd'.repeat(32))))
  const parts = encrypted.split('.'); parts[3] = Buffer.from('modified').toString('base64url')
  assert.throws(() => openSecret(parts.join('.'), key))
})
test('Windsor: recusa proteção ausente, chave/URL malformada', () => {
  assert.throws(() => encryptionKey('short'))
  assert.ok(validWindsorKey('a-valid_api-key.123'))
  for (const v of ['', '123', 'https://host/?api_key=abc', 'a key with spaces', 'a'.repeat(513)]) assert.equal(validWindsorKey(v), false)
})

test('Windsor: consulta no servidor, sem devolver chave em erros ou mensagens', async () => {
  const { windsorQuery } = await import('../src/lib/windsor.ts')
  const original = globalThis.fetch, key = 'secret-query-key-123'
  try {
    globalThis.fetch = async input => {
      const u = new URL(String(input))
      assert.equal(u.hostname, 'connectors.windsor.ai')
      assert.equal(u.searchParams.get('api_key'), key)
      assert.equal(u.searchParams.get('fields'), 'account_name')
      return Response.json({ data: [{ account_name: 'Empresa Teste' }] })
    }
    const ok = await windsorQuery('instagram', ['account_name'], 'last_7d', { apiKey: key })
    assert.equal(ok.status, 'ok')
    globalThis.fetch = async () => Response.json({ error: 'url contains ' + key })
    const failure = await windsorQuery('instagram', ['account_name'], 'last_7d', { apiKey: key })
    assert.equal(failure.status, 'error')
    assert.ok(!JSON.stringify(failure).includes(key))
    globalThis.fetch = async () => new Response(key, { status: 401 })
    const auth = await windsorQuery('instagram', ['account_name'], 'last_7d', { apiKey: key })
    assert.equal(auth.status, 'error')
    assert.ok(!JSON.stringify(auth).includes(key))
  } finally { globalThis.fetch = original }
})
