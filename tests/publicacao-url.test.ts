import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizePermalink, validatePublishedUrl } from '../src/lib/domain/publish-url.ts'

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
