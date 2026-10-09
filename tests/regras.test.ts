import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountInScope, identifyBrand, normalizeAliases, partitionByScope, resolveAccount, type BrandAliases, type Mapping } from '../src/lib/integrations.ts'
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

const BR: BrandAliases[] = [
  { id: 'minas', aliases: ['minas farma', 'minasfarma', 'extra farma', 'extrafarma'] },
  { id: 'ff', aliases: ['farma e farma', 'farmaefarma', 'drogaria melhor preco', 'melhor preco'] },
]

const maps: Mapping[] = [
  { account_name: 'Loja A Ads', kind: 'ads', brand_id: 'minas', branch_id: null },
  { account_name: 'Loja B Ads', kind: 'ads', brand_id: 'minas', branch_id: 'bg' },
  { account_name: 'ff_insta', kind: 'instagram', brand_id: 'ff', branch_id: null },
]

test('contas por escopo: rede e filial separam os resultados', () => {
  assert.equal(accountInScope('Loja A Ads', 'ads', maps, BR, {}), 'in')
  assert.equal(accountInScope('Loja A Ads', 'ads', maps, BR, { brandId: 'ff' }), 'out')
  assert.equal(accountInScope('Loja A Ads', 'ads', maps, BR, { brandId: 'minas', branchId: 'qualquer' }), 'in') // conta da rede inteira vale p/ toda filial
  assert.equal(accountInScope('Loja B Ads', 'ads', maps, BR, { brandId: 'minas', branchId: 'bg' }), 'in')
  assert.equal(accountInScope('Loja B Ads', 'ads', maps, BR, { brandId: 'minas', branchId: 'outra' }), 'out')
  assert.equal(accountInScope('ff_insta', 'instagram', maps, BR, { brandId: 'minas' }), 'out')
})

test('contas sem associação só aparecem sem filtro e sempre sinalizadas', () => {
  assert.equal(accountInScope('Nova', 'ads', maps, BR, {}), 'unmapped')
  assert.equal(accountInScope('Nova', 'ads', maps, BR, { brandId: 'minas' }), 'out')
  const all = partitionByScope([{ account_name: 'Nova' }, { account_name: 'Loja A Ads' }], 'ads', maps, BR, {})
  assert.equal(all.rows.length, 2)
  assert.deepEqual(all.unmapped, ['Nova'])
  const scoped = partitionByScope([{ account_name: 'Nova' }, { account_name: 'Loja A Ads' }], 'ads', maps, BR, { brandId: 'minas' })
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

test('identificação pelo nome da conta (Windsor)', () => {
  assert.equal(identifyBrand('Baixo Guandu - Minas Farma', BR), 'minas')
  assert.equal(identifyBrand('Filial MINAS FARMA', BR), 'minas')
  assert.equal(identifyBrand('farmaefarmabg', BR), 'ff')
  assert.equal(identifyBrand('Drogaria Melhor Preço', BR), 'ff')
  assert.equal(identifyBrand('Conta qualquer', BR), null)
  assert.equal(identifyBrand('', BR), null)
})

test('nome que casa com as duas filiais é ambíguo e não é adivinhado', () => {
  assert.equal(identifyBrand('Minas Farma e Farma e Farma', BR), null)
})

test('associação manual vence a identificação pelo nome', () => {
  const m: Mapping[] = [{ account_name: 'Baixo Guandu - Minas Farma', kind: 'ads', brand_id: 'ff', branch_id: null }]
  assert.deepEqual(resolveAccount('Baixo Guandu - Minas Farma', 'ads', m, BR), { brandId: 'ff', branchId: null, source: 'manual' })
  assert.deepEqual(resolveAccount('Baixo Guandu - Minas Farma', 'ads', [], BR), { brandId: 'minas', branchId: null, source: 'auto' })
  assert.equal(resolveAccount('Sem nome útil', 'ads', [], BR), null)
})

test('as duas filiais ficam separadas nos resultados, sem precisar associar nada à mão', () => {
  const rows = [{ account_name: 'Baixo Guandu - Minas Farma' }, { account_name: 'Drogaria Melhor Preço' }, { account_name: 'farmaefarmabg' }]
  const minas = partitionByScope(rows, 'ads', [], BR, { brandId: 'minas' })
  assert.deepEqual(minas.rows.map((r) => r.account_name), ['Baixo Guandu - Minas Farma'])
  const ff = partitionByScope(rows, 'ads', [], BR, { brandId: 'ff' })
  assert.deepEqual(ff.rows.map((r) => r.account_name), ['Drogaria Melhor Preço', 'farmaefarmabg'])
  const all = partitionByScope(rows, 'ads', [], BR, {})
  assert.equal(all.rows.length, 3)
  assert.deepEqual(all.unmapped, [])
})

test('apelidos: limpeza, limite e tamanho mínimo', () => {
  const ok = normalizeAliases('Minas Farma, MINASFARMA; Filial Minas')
  assert.ok(ok.ok && ok.list.includes('minas farma') && ok.list.length === 3)
  assert.equal(normalizeAliases('').ok, false)
  assert.equal(normalizeAliases('ab, minas farma').ok, false)
  assert.equal(normalizeAliases('Drogaria Melhor Preço').ok && true, true)
  const many = normalizeAliases(Array.from({ length: 13 }, (_, i) => 'apelido numero ' + i).join(','))
  assert.equal(many.ok, false)
})

test('regras do dono: "Extra Farma" é Minas Farma; "Drogaria Melhor Preço" é Farma e Farma', () => {
  assert.equal(identifyBrand('Extra Farma Baixo Guandu', BR), 'minas')
  assert.equal(identifyBrand('EXTRAFARMA - Instagram', BR), 'minas')
  assert.equal(identifyBrand('extra_farma_bg', BR), 'minas')
  assert.equal(identifyBrand('Drogaria Melhor Preço', BR), 'ff')
  assert.equal(identifyBrand('melhorprecobg', BR), 'ff')
  // "Extra Farma" sozinho nunca vira Farma e Farma
  assert.notEqual(identifyBrand('Extra Farma', BR), 'ff')
})
