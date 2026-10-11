import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safeFetch } from '../src/lib/external/fetch.ts'

// A trava roda ANTES de qualquer acesso à rede: estes casos não precisam de internet.
test('busca externa recusa tudo que não seja https nos domínios da lista', async () => {
  for (const url of [
    'http://brasilapi.com.br/api/feriados/v1/2026', // sem https
    'https://evil.com/api', // domínio fora da lista
    'https://www.gov.br.evil.com/x', // domínio parecido
    'https://evil.com/www.gov.br',
    'https://127.0.0.1/x', // IP local
    'https://169.254.169.254/latest/meta-data', // metadados de nuvem
    'https://localhost:3000/x',
    'ftp://www.gov.br/x',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://user:pass@evil.com@www.gov.br.evil.com/',
    'não é url',
  ]) {
    const r = await safeFetch(url)
    assert.equal(r.ok, false, url)
    assert.match((r as { error: string }).error, /Fonte não permitida|Endereço inválido/, url)
  }
})

test('User-Agent da busca é só ASCII (o IBGE recusa cabeçalho com acento)', async () => {
  const { USER_AGENT } = await import('../src/lib/external/fetch.ts')
  assert.match(USER_AGENT, /^[\x20-\x7e]+$/)
})
