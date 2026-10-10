import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PDFDocument } from 'pdf-lib'
import { snapshotToBlocks } from '../src/lib/reports/blocks.ts'
import { reportToCsv } from '../src/lib/reports/csv.ts'
import { reportToPdf } from '../src/lib/reports/pdf.ts'
import type { ReportSnapshot } from '../src/lib/reports/build.ts'

const stages = { ideia: 0, briefing: 1, producao: 0, revisao: 0, aprovacao: 0, aprovado: 0, agendado: 0, publicado: 2, cancelado: 0 }
const base = (over: Partial<ReportSnapshot> = {}): ReportSnapshot => ({
  version: 1, type: 'resultados',
  meta: { brandName: 'Farma e Farma', branchName: null, from: '2026-10-01', to: '2026-10-31', formatLabel: null, campaignName: null, generatedAt: '2026-10-09T15:00:00.000Z', generatedOn: '2026-10-09', dataThrough: '2026-10-09T14:00:00.000Z' },
  operacional: null, executivo: null,
  resultados: {
    publications: [
      { date: '2026-10-02', account: 'farmaefarmabg', format: 'Reels', permalink: 'https://www.instagram.com/p/x/', reach: 1000, views: 3000, likes: 50, comments: null, saves: 20, shares: 10, interactions: null, engagement: null, collectedOn: '2026-10-09', quality: 'partial', content: '=SOMA(A1) perigoso', ageDays: 7 },
      { date: '2026-10-03', account: 'farmaefarmabg', format: 'Feed', permalink: null, reach: 0, views: 0, likes: 0, comments: 0, saves: 0, shares: 0, interactions: 0, engagement: null, collectedOn: '2026-10-09', quality: 'complete', content: null, ageDays: 6 },
    ],
    immature: 1, byFormat: [{ format: 'Reels', engagement: { key: 'Reels', n: 2, median: null, enough: false }, savesPerK: { key: 'Reels', n: 2, median: null, enough: false } }],
    campaigns: [], accounts: [{ kind: 'ads', account: 'Baixo Guandu', periodStart: '2026-10-01', periodEnd: '2026-10-09', collectedOn: '2026-10-09', quality: 'complete', followers: null, views: null, interactions: null, spend: 120.5, conversations: 0, costPerConversation: null }],
    unlinked: 2,
  },
  ...over,
})

test('relatório de resultados: N/D aparece como N/D e zero medido continua zero', () => {
  const tables = snapshotToBlocks(base()).filter((b) => b.kind === 'table')
  const pubs = tables[0]
  assert.equal(pubs.kind === 'table' && pubs.rows[0][5], 'N/D') // comentários ausentes
  assert.equal(pubs.kind === 'table' && pubs.rows[0][8], 'N/D') // engajamento sem as quatro parcelas
  assert.equal(pubs.kind === 'table' && pubs.rows[1][2], '0') // alcance zero medido
  assert.equal(pubs.kind === 'table' && pubs.rows[1][8], 'N/D') // engajamento com alcance zero = N/D
  const ads = tables.find((t) => t.kind === 'table' && t.title.includes('anúncios'))!
  assert.equal(ads.kind === 'table' && ads.rows[0][3], '0') // 0 conversas medidas
  assert.equal(ads.kind === 'table' && ads.rows[0][4], 'N/D') // custo por conversa sem conversas
})

test('CSV: cabeçalho com filial, período, filtros e fonte; separador ; e BOM; sem injeção de fórmula', () => {
  const csv = reportToCsv(base())
  assert.ok(csv.startsWith('﻿'))
  assert.match(csv, /Relatório resultados — Farma e Farma/)
  assert.match(csv, /Período;01\/10\/2026 a 31\/10\/2026/)
  assert.match(csv, /Filtros;nenhum/)
  assert.match(csv, /Fonte;/)
  assert.match(csv, /N\/D = a rede ou o sistema não informou/)
  assert.match(csv, /'=SOMA\(A1\) perigoso/) // fórmula neutralizada
  assert.ok(!/;undefined|;NaN/.test(csv))
})

test('PDF A4 válido, com várias páginas quando a tabela é grande', async () => {
  const many = base()
  many.resultados!.publications = Array.from({ length: 120 }, (_, i) => ({ ...many.resultados!.publications[0], date: '2026-10-02', content: 'Conteúdo ' + i }))
  const bytes = await reportToPdf(many)
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-')
  const pdf = await PDFDocument.load(bytes)
  assert.ok(pdf.getPageCount() >= 3)
  const { width, height } = pdf.getPage(0).getSize()
  assert.ok(Math.abs(width - 595.28) < 0.1 && Math.abs(height - 841.89) < 0.1)
})

test('PDF tolera emoji, aspas curvas e símbolos fora do Latin-1 sem quebrar', async () => {
  const s = base({ type: 'operacional', resultados: null, operacional: {
    planned: 3, published: 2, overdueCount: 0, noOwner: 0, pendingApprovals: 0, pendingReconfirm: 0, byStage: stages as never, overdue: [],
    items: [{ title: '🔥 Oferta “especial” — R$ 4,90 ≥ meta', date: '2026-10-02', format: 'Feed', stage: 'Publicado', owner: null, campaign: null }], itemsTruncated: false,
  } })
  const pdf = await PDFDocument.load(await reportToPdf(s))
  assert.ok(pdf.getPageCount() >= 1)
})

test('relatório executivo: monta os blocos só com o próprio retrato (sem depender do bloco de resultados)', async () => {
  const s = base({
    type: 'executivo', resultados: null,
    executivo: {
      planned: 10, published: 4, overdue: 2, pendingApprovals: 1, realPublications: 3,
      goals: [{ label: 'Conteúdos publicados', unit: 'count', direction: 'atLeast', target: 10, realized: 4, source: 'internal', asOf: null, status: 'Em andamento', pct: 40 },
        { label: 'Investimento em anúncios', unit: 'brl', direction: 'atMost', target: 200, realized: null, source: 'none', asOf: null, status: 'N/D', pct: null }],
      byFormat: [{ format: 'Reels', engagement: { key: 'Reels', n: 3, median: 8.5, enough: true } }, { format: 'Feed', engagement: { key: 'Feed', n: 1, median: null, enough: false } }],
      observations: [], nextSteps: [{ label: 'Conteúdos atrasados', count: 2, href: '/producao?atrasados=1' }],
    },
  })
  const blocks = snapshotToBlocks(s)
  const flat = JSON.stringify(blocks)
  assert.match(flat, /Visão rápida/)
  assert.match(flat, /8,50%/)
  assert.match(flat, /amostra pequena/)
  assert.match(flat, /Ainda não há dados suficientes para observações confiáveis/)
  assert.match(flat, /Conteúdos atrasados: 2/)
  assert.match(flat, /Investimento em anúncios \(teto\)/)
  assert.match(reportToCsv(s), /Metas de/)
  const pdf = await PDFDocument.load(await reportToPdf(s))
  assert.ok(pdf.getPageCount() >= 1)
})

test('relatório operacional e de resultados também montam CSV e PDF', async () => {
  const op = base({ type: 'operacional', resultados: null, operacional: {
    planned: 2, published: 1, overdueCount: 1, noOwner: 0, pendingApprovals: 0, pendingReconfirm: 0, byStage: stages as never,
    overdue: [{ title: 'Atrasado', date: '2026-10-01', daysLate: 8, stage: 'Em produção' }], items: [], itemsTruncated: false,
  } })
  assert.match(reportToCsv(op), /Atrasados/)
  assert.ok((await PDFDocument.load(await reportToPdf(op))).getPageCount() >= 1)
  assert.ok((await PDFDocument.load(await reportToPdf(base()))).getPageCount() >= 1)
})
