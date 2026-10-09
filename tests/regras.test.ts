import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountInScope, partitionByScope, type Mapping } from '../src/lib/integrations.ts'
import { canWrite, generateTempPassword, isAdmin, userChangeBlockedReason, validatePassword, validateUsername } from '../src/lib/perms.ts'
import { classifyWindsorPayload, sumAds } from '../src/lib/windsor.ts'

test('perfis: só administrador e editor escrevem; só administrador administra', () => {
  assert.equal(canWrite('admin'), true)
  assert.equal(canWrite('editor'), true)
  assert.equal(canWrite('viewer'), false)
  assert.equal(canWrite('qualquer'), false)
  assert.equal(isAdmin('admin'), true)
  assert.equal(isAdmin('editor'), false)
})

test('usuários: não deixa ficar sem administrador nem alterar a si mesmo', () => {
  const base = { actorId: 'a', targetId: 'b', targetRole: 'admin', targetActive: true, activeAdmins: 1 }
  assert.ok(userChangeBlockedReason({ ...base, change: { role: 'viewer' } }))
  assert.ok(userChangeBlockedReason({ ...base, change: { active: false } }))
  assert.equal(userChangeBlockedReason({ ...base, activeAdmins: 2, change: { active: false } }), null)
  assert.ok(userChangeBlockedReason({ ...base, targetId: 'a', activeAdmins: 3, change: { role: 'editor' } }))
  assert.equal(userChangeBlockedReason({ ...base, targetRole: 'editor', change: { role: 'viewer' } }), null)
})

test('senha e usuário: validações', () => {
  assert.ok(validatePassword('curta1'))
  assert.ok(validatePassword('somenteletrasaqui'))
  assert.ok(validatePassword('12345678901'))
  assert.equal(validatePassword('Senha-Boa-123'), null)
  assert.ok(validateUsername('ab'))
  assert.ok(validateUsername('com espaço'))
  assert.equal(validateUsername('maria.silva'), null)
})

test('senha provisória gerada passa na própria validação e varia', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 20; i++) {
    const p = generateTempPassword()
    assert.equal(validatePassword(p), null, p)
    assert.ok(!/[0Ool1I]/.test(p.split('-')[0]), 'sem caracteres ambíguos')
    seen.add(p)
  }
  assert.ok(seen.size > 15)
})

const maps: Mapping[] = [
  { account_name: 'Loja A Ads', kind: 'ads', brand_id: 'minas', branch_id: null },
  { account_name: 'Loja B Ads', kind: 'ads', brand_id: 'minas', branch_id: 'bg' },
  { account_name: 'ff_insta', kind: 'instagram', brand_id: 'ff', branch_id: null },
]

test('contas por escopo: rede e filial separam os resultados', () => {
  assert.equal(accountInScope('Loja A Ads', 'ads', maps, {}), 'in')
  assert.equal(accountInScope('Loja A Ads', 'ads', maps, { brandId: 'ff' }), 'out')
  assert.equal(accountInScope('Loja A Ads', 'ads', maps, { brandId: 'minas', branchId: 'qualquer' }), 'in') // conta da rede inteira vale p/ toda filial
  assert.equal(accountInScope('Loja B Ads', 'ads', maps, { brandId: 'minas', branchId: 'bg' }), 'in')
  assert.equal(accountInScope('Loja B Ads', 'ads', maps, { brandId: 'minas', branchId: 'outra' }), 'out')
  assert.equal(accountInScope('ff_insta', 'instagram', maps, { brandId: 'minas' }), 'out')
})

test('contas sem associação só aparecem sem filtro e sempre sinalizadas', () => {
  assert.equal(accountInScope('Nova', 'ads', maps, {}), 'unmapped')
  assert.equal(accountInScope('Nova', 'ads', maps, { brandId: 'minas' }), 'out')
  const all = partitionByScope([{ account_name: 'Nova' }, { account_name: 'Loja A Ads' }], 'ads', maps, {})
  assert.equal(all.rows.length, 2)
  assert.deepEqual(all.unmapped, ['Nova'])
  const scoped = partitionByScope([{ account_name: 'Nova' }, { account_name: 'Loja A Ads' }], 'ads', maps, { brandId: 'minas' })
  assert.equal(scoped.rows.length, 1)
  assert.deepEqual(scoped.unmapped, [])
})

test('windsor: aviso de leituras pausadas nunca vira número', () => {
  const paused = classifyWindsorPayload({ data: [{ campaign: 'Uh-oh! These are not your real numbers: reads are paused because you have 2 accounts', spend: 0 }] })
  assert.equal(paused.status, 'paused')
  assert.equal(classifyWindsorPayload({ error: 'x', code: 'no_accounts_configured' }).status, 'no_accounts')
  assert.equal(classifyWindsorPayload({ error: 'falhou' }).status, 'error')
  const ok = classifyWindsorPayload({ data: [{ campaign: 'Limpeza', spend: 10 }] })
  assert.equal(ok.status, 'ok')
  assert.equal(classifyWindsorPayload(null).status, 'error')
})

test('anúncios: totais e razões (sem divisão por zero)', () => {
  const t = sumAds([{ spend: 10, clicks: 5, impressions: 1000 }, { spend: 5, clicks: 5, impressions: 1000 }])
  assert.equal(t.spend, 15)
  assert.equal(t.clicks, 10)
  assert.equal(t.ctr, 0.5)
  assert.equal(t.cpc, 1.5)
  assert.equal(t.cpm, 7.5)
  assert.equal(sumAds([]).ctr, null)
  assert.equal(sumAds([{ spend: 3 }]).cpc, null)
})
