import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_UPLOAD_BYTES, formatBytes, normalizeTag, parseTags, safeFileName, sniffMime, validateExternalUrl } from '../src/lib/domain/index.ts'
import { canDecide, decisionNeedsReason, needsValidApproval } from '../src/lib/domain/index.ts'
import { canonicalContent, contentChecksum, type ContentPayload } from '../src/lib/approvals/checksum.ts'

const bytes = (...n: number[]) => Uint8Array.from([...n, ...new Array(Math.max(0, 16 - n.length)).fill(0)])

test('tipo do arquivo vem do conteúdo, não do nome', () => {
  assert.equal(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'image/png')
  assert.equal(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg')
  assert.equal(sniffMime(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31)), 'application/pdf')
  assert.equal(sniffMime(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0])), 'image/webp')
  assert.equal(sniffMime(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)), 'image/gif')
})

test('executável, HTML, SVG e arquivo curto são recusados mesmo "disfarçados"', () => {
  assert.equal(sniffMime(bytes(0x4d, 0x5a, 0x90, 0x00)), null) // .exe
  assert.equal(sniffMime(new TextEncoder().encode('<html><script>alert(1)</script></html>')), null)
  assert.equal(sniffMime(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null)
  assert.equal(sniffMime(Uint8Array.from([0x89, 0x50])), null)
  assert.equal(sniffMime(new Uint8Array(0)), null)
})

test('nome do arquivo: sem caminho nem caracteres perigosos', () => {
  assert.equal(safeFileName('../../etc/passwd'), 'passwd')
  assert.equal(safeFileName('C:\\Users\\x\\foto.png'), 'foto.png')
  assert.equal(safeFileName('arte "final"<v2>.png'), 'arte finalv2.png')
  assert.equal(safeFileName('   '), 'arquivo')
  assert.equal(safeFileName('a'.repeat(300)).length, 120)
})

test('etiquetas: normalizadas, sem repetição e com limite', () => {
  assert.equal(normalizeTag('  Fim de Semana  da LIMPEZA! '), 'fim de semana da limpeza')
  assert.deepEqual(parseTags('Ofertas, ofertas; Bebê\nReels'), ['ofertas', 'bebê', 'reels'])
  assert.equal(parseTags(Array.from({ length: 30 }, (_, i) => 'tag' + i).join(',')).length, 10)
  assert.deepEqual(parseTags(',, ;'), [])
})

test('link externo: só https público', () => {
  assert.equal(validateExternalUrl('https://drive.google.com/file/d/abc/view'), null)
  assert.ok(validateExternalUrl('http://exemplo.com/x'))
  assert.ok(validateExternalUrl('javascript:alert(1)'))
  assert.ok(validateExternalUrl('https://localhost/x'))
  assert.ok(validateExternalUrl('https://192.168.0.10/x'))
  assert.ok(validateExternalUrl('https://[::1]/x'))
  assert.ok(validateExternalUrl('https://user:senha@exemplo.com/x'))
  assert.ok(validateExternalUrl('https://intranet/x'))
  assert.ok(validateExternalUrl('não é url'))
})

test('limites e formatação de tamanho', () => {
  assert.equal(MAX_UPLOAD_BYTES, 4194304)
  assert.equal(formatBytes(2048), '2 KB')
  assert.equal(formatBytes(1572864), '1,5 MB')
})

const base: ContentPayload = {
  title: 'Corta Preço', caption: 'Oferta X', script: '', reels: {}, origin: '', campaignId: null,
  assets: [{ assetId: 'b', role: 'final', checksum: 'h2', url: null }, { assetId: 'a', role: 'draft', checksum: 'h1', url: null }],
}

test('impressão digital: estável e sensível a qualquer mudança relevante', () => {
  const h = contentChecksum(base)
  assert.equal(h, contentChecksum({ ...base, assets: [...base.assets].reverse() })) // ordem dos anexos não conta
  assert.equal(h.length, 64)
  assert.notEqual(h, contentChecksum({ ...base, caption: 'Oferta Y' }))
  assert.notEqual(h, contentChecksum({ ...base, title: 'Outro' }))
  assert.notEqual(h, contentChecksum({ ...base, campaignId: 'c1' }))
  assert.notEqual(h, contentChecksum({ ...base, assets: [base.assets[0]] })) // tirar um anexo
  assert.notEqual(h, contentChecksum({ ...base, assets: [{ ...base.assets[0], checksum: 'novo' }, base.assets[1]] })) // arte trocada
  assert.notEqual(h, contentChecksum({ ...base, assets: [{ ...base.assets[0], role: 'draft' }, base.assets[1]] })) // papel mudou
  assert.equal(canonicalContent({ ...base, reels: { b: 1, a: 2 } }), canonicalContent({ ...base, reels: { a: 2, b: 1 } })) // ordem das chaves não conta
})

test('aprovação: quem decide e quando é exigida', () => {
  assert.equal(canDecide({ userId: 'u1', role: 'admin', reviewerId: null, submittedBy: 'u1' }), null) // admin pode, mesmo sendo quem enviou
  assert.equal(canDecide({ userId: 'u2', role: 'editor', reviewerId: 'u2', submittedBy: 'u1' }), null)
  assert.ok(canDecide({ userId: 'u2', role: 'editor', reviewerId: 'u2', submittedBy: 'u2' })) // editor não aprova o próprio envio
  assert.ok(canDecide({ userId: 'u3', role: 'editor', reviewerId: 'u2', submittedBy: 'u1' })) // não é o revisor
  assert.ok(canDecide({ userId: 'u3', role: 'viewer', reviewerId: null, submittedBy: 'u1' }))
  assert.equal(decisionNeedsReason('approved'), false)
  assert.equal(decisionNeedsReason('rejected'), true)
  assert.equal(decisionNeedsReason('changes_requested'), true)
  assert.equal(needsValidApproval('aprovado', true), true)
  assert.equal(needsValidApproval('publicado', true), true)
  assert.equal(needsValidApproval('producao', true), false)
  assert.equal(needsValidApproval('aprovado', false), false)
})
