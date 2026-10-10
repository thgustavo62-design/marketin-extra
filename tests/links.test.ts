import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildFinalUrl, canApproveLink, isInspirationKind, isNetwork, normalizePermalink, normalizeUtm, optionalHttps, slugUtm, validateDestination, validatePublishedUrl,
} from '../src/lib/domain/links.ts'

test('destino: só https, público, sem credenciais, sem IP', () => {
  const ok = validateDestination('https://www.minasfarma.com.br/clube?x=1#topo')
  assert.equal(ok.ok, true)
  if (ok.ok) { assert.equal(ok.url, 'https://www.minasfarma.com.br/clube?x=1'); assert.equal(ok.host, 'www.minasfarma.com.br') }
  for (const bad of [
    'http://site.com.br', 'javascript:alert(1)', 'https://user:pw@site.com.br', 'https://127.0.0.1/x', 'https://[::1]/x', 'https://localhost/x', 'https://intranet.local/x',
    'https://servidor/x', 'https://site.com.br:8443/x', 'https://site .com.br', '', 'ftp://site.com.br', 'https://169.254.169.254/latest/meta-data',
  ]) assert.equal(validateDestination(bad).ok, false, bad)
})

test('destino: UTM que já vinha no endereço é removido (e avisado), o resto do endereço fica', () => {
  const r = validateDestination('https://site.com.br/p?id=7&UTM_Source=velho&utm_medium=x')
  assert.equal(r.ok, true)
  if (r.ok) { assert.equal(r.url, 'https://site.com.br/p?id=7'); assert.deepEqual(r.removedParams.sort(), ['utm_medium', 'utm_source']) }
})

test('slug de UTM: sem acento, minúsculo, hífens', () => {
  assert.equal(slugUtm('Fim de Semana da Limpeza!'), 'fim-de-semana-da-limpeza')
  assert.equal(slugUtm('  Corta Preço  '), 'corta-preco')
  assert.equal(slugUtm('a__b--c'), 'a__b-c')
  assert.equal(slugUtm('***'), '')
  assert.equal(slugUtm('x'.repeat(100)).length, 60)
})

test('UTM obrigatórios e URL final com os demais parâmetros preservados', () => {
  assert.equal(normalizeUtm({ source: '', medium: 'social', campaign: 'x' }).ok, false)
  assert.equal(normalizeUtm({ source: 'instagram', medium: '', campaign: 'x' }).ok, false)
  assert.equal(normalizeUtm({ source: 'instagram', medium: 'social', campaign: '' }).ok, false)
  const n = normalizeUtm({ source: 'Instagram', medium: 'Social', campaign: 'Corta Preço', content: 'Reels 1' })
  assert.equal(n.ok, true)
  if (n.ok) {
    assert.deepEqual(n.utm, { source: 'instagram', medium: 'social', campaign: 'corta-preco', content: 'reels-1' })
    assert.equal(buildFinalUrl('https://site.com.br/p?id=7', n.utm), 'https://site.com.br/p?id=7&utm_source=instagram&utm_medium=social&utm_campaign=corta-preco&utm_content=reels-1')
  }
})

test('quem cria não aprova o próprio link; leitor nunca aprova; administrador pode', () => {
  assert.match(canApproveLink({ userId: 'a', role: 'editor', createdBy: 'a' }) ?? '', /não pode aprová-lo/)
  assert.equal(canApproveLink({ userId: 'b', role: 'editor', createdBy: 'a' }), null)
  assert.equal(canApproveLink({ userId: 'a', role: 'admin', createdBy: 'a' }), null)
  assert.match(canApproveLink({ userId: 'b', role: 'viewer', createdBy: 'a' }) ?? '', /não pode aprovar/)
})

test('endereço da publicação: só redes conhecidas, https, sem credenciais', () => {
  assert.equal(validatePublishedUrl('https://www.instagram.com/p/DeIg7twirje/').ok, true)
  assert.equal(validatePublishedUrl('https://youtu.be/abc').ok, true)
  assert.equal(validatePublishedUrl('https://m.facebook.com/x/posts/1').ok, true)
  for (const bad of ['', 'http://instagram.com/p/x', 'https://evil.com/instagram.com', 'https://instagram.com.evil.com/p/x', 'https://u:p@instagram.com/p/x', 'abc']) assert.equal(validatePublishedUrl(bad).ok, false, bad)
})

test('permalink normalizado para comparação', () => {
  assert.equal(normalizePermalink('https://www.Instagram.com/p/ABC/?utm_source=ig#x'), 'https://instagram.com/p/ABC')
  assert.equal(normalizePermalink('https://instagram.com/p/ABC'), normalizePermalink('https://www.instagram.com/p/ABC/'))
})

test('referências: rede, tipo de inspiração e link opcional', () => {
  assert.equal(isNetwork('instagram'), true)
  assert.equal(isNetwork('toString'), false)
  assert.equal(isInspirationKind('ideia'), true)
  assert.equal(isInspirationKind('x'), false)
  assert.deepEqual(optionalHttps(''), { ok: true, url: null })
  assert.equal(optionalHttps('https://instagram.com/farmacia').ok, true)
  assert.equal(optionalHttps('http://x.com').ok, false)
  assert.equal(optionalHttps('javascript:alert(1)').ok, false)
})
