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

test('certificado intermediário embutido para o IBGE: é o Sectigo DV R36 de verdade e vale só para o domínio do IBGE', async () => {
  const { X509Certificate } = await import('node:crypto')
  const { EXTRA_CA } = await import('../src/lib/external/ca.ts')
  assert.deepEqual(Object.keys(EXTRA_CA), ['servicodados.ibge.gov.br'])
  const c = new X509Certificate(EXTRA_CA['servicodados.ibge.gov.br'][0])
  assert.match(c.subject, /CN=Sectigo Public Server Authentication CA DV R36/)
  assert.match(c.issuer, /CN=Sectigo Public Server Authentication Root R46/)
  assert.equal(c.fingerprint256, '8C:54:C3:34:B6:6B:A4:E4:26:77:2A:F4:A3:F9:13:6C:19:A1:AE:C7:29:FD:B2:8C:53:5C:07:A5:A4:EF:22:E0')
  assert.ok(new Date(c.validTo).getTime() > Date.now() + 365 * 864e5, 'não vence em menos de um ano')
})
