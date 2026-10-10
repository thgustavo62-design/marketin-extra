import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { rowAllowed } from '@/lib/access'
import { pool } from '@/lib/db'
import { isUuid } from '@/lib/form'
import { getSession } from '@/lib/session'

// QR Code do link aprovado. Só o endereço final entra no código; nada pessoal. Sem acesso à filial: 404.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const { id } = await ctx.params
  if (!isUuid(id) || !(await rowAllowed(user, 'campaign_links', id))) return NextResponse.json({ error: 'Link não encontrado.' }, { status: 404 })
  const row = (await pool.query(`select final_url, status, label from campaign_links where id = $1`, [id])).rows[0]
  if (!row) return NextResponse.json({ error: 'Link não encontrado.' }, { status: 404 })
  if (row.status !== 'aprovado') return NextResponse.json({ error: 'Aprove o link antes de gerar o QR Code.' }, { status: 409 })
  const u = new URL(req.url).searchParams
  const png = u.get('formato') === 'png'
  const file = `qr-${String(row.label).normalize('NFD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'link'}`
  const headers: Record<string, string> = { 'Content-Security-Policy': "sandbox; default-src 'none'", 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  if (u.get('baixar') === '1') headers['Content-Disposition'] = `attachment; filename="${file}.${png ? 'png' : 'svg'}"`
  if (png) {
    const buf = await QRCode.toBuffer(row.final_url, { type: 'png', width: 1024, margin: 2, errorCorrectionLevel: 'M' })
    return new NextResponse(new Uint8Array(buf), { headers: { ...headers, 'Content-Type': 'image/png' } })
  }
  const svg = await QRCode.toString(row.final_url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' })
  return new NextResponse(svg, { headers: { ...headers, 'Content-Type': 'image/svg+xml' } })
}
