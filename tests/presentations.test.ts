import test from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from 'fflate'
import { CHUNK_BYTES, MAX_PRESENTATION_BYTES, chunkCountFor, kindFromName, sniffPresentation, titleFromFileName, validateUploadStart } from '../src/lib/domain/presentations.ts'

test('tipo pelo nome do arquivo', () => {
  assert.equal(kindFromName('Relatório.PPTX'), 'pptx')
  assert.equal(kindFromName('a.pdf'), 'pdf')
  assert.equal(kindFromName('a.ppt'), null)
  assert.equal(kindFromName('semextensao'), null)
})

test('tipo real pelos bytes: PDF, PPTX e o que não é nenhum dos dois', () => {
  assert.equal(sniffPresentation(strToU8('%PDF-1.7\n...')), 'pdf')
  const pptx = zipSync({ '[Content_Types].xml': strToU8('<x/>'), 'ppt/presentation.xml': strToU8('<p/>') })
  assert.equal(sniffPresentation(pptx), 'pptx')
  const docx = zipSync({ '[Content_Types].xml': strToU8('<x/>'), 'word/document.xml': strToU8('<d/>') })
  assert.equal(sniffPresentation(docx), null)
  assert.equal(sniffPresentation(strToU8('texto qualquer')), null)
  assert.equal(sniffPresentation(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])), null)
})

test('título vem do nome do arquivo', () => {
  assert.equal(titleFromFileName('Andamento do Marketing — Out 2026.pdf'), 'Andamento do Marketing — Out 2026')
  assert.equal(titleFromFileName('Analise_Geral_MinasFarma.pptx'), 'Analise Geral MinasFarma')
  assert.equal(titleFromFileName('.pdf'), 'Apresentação')
})

test('validação do início do envio', () => {
  const ok = { size: CHUNK_BYTES * 2 + 10, chunks: 3, kind: 'pptx' }
  assert.equal(validateUploadStart(ok), null)
  assert.match(validateUploadStart({ ...ok, size: 0 }) ?? '', /vazio/)
  assert.match(validateUploadStart({ size: MAX_PRESENTATION_BYTES + 1, chunks: chunkCountFor(MAX_PRESENTATION_BYTES + 1), kind: 'pdf' }) ?? '', /passa de/)
  assert.match(validateUploadStart({ ...ok, chunks: 2 }) ?? '', /partes/)
  assert.match(validateUploadStart({ ...ok, kind: 'docx' }) ?? '', /PPTX ou PDF/)
})
