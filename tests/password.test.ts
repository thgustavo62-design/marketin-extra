import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword } from '../src/lib/password.ts'

test('hash verifica a senha correta e rejeita a errada', async () => {
  const hash = await hashPassword('Senha-Forte-123')
  assert.ok(hash.startsWith('scrypt$'))
  assert.equal(await verifyPassword('Senha-Forte-123', hash), true)
  assert.equal(await verifyPassword('senha-forte-123', hash), false)
})

test('a senha é sensível a maiúsculas e não é aparada', async () => {
  const hash = await hashPassword('Abc 123')
  assert.equal(await verifyPassword('Abc 123 ', hash), false)
  assert.equal(await verifyPassword('ABC 123', hash), false)
})

test('salt aleatório: mesma senha gera hashes diferentes', async () => {
  const [a, b] = await Promise.all([hashPassword('igual'), hashPassword('igual')])
  assert.notEqual(a, b)
})

test('hash malformado nunca valida', async () => {
  assert.equal(await verifyPassword('x', 'lixo'), false)
  assert.equal(await verifyPassword('x', ''), false)
})
