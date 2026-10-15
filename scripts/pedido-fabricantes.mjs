// Prepara o pedido de fotos aos fabricantes: lista dos produtos do catálogo que ainda não têm imagem, agrupada pela marca provável.
//   node --env-file=.env --experimental-strip-types scripts/pedido-fabricantes.mjs --saida "<pasta>"
// Gera: produtos-sem-foto.csv (EAN; descrição; grupo; marca provável) · resumo-por-marca.csv · modelo-email-fabricantes.txt
// A marca é um palpite pelo nome (primeira palavra frequente que não seja categoria, cor ou unidade): confira antes de enviar.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const i = process.argv.indexOf('--saida')
const OUT = i > 0 ? process.argv[i + 1] : null
if (!OUT) { console.error('Informe --saida "<pasta>"'); process.exit(2) }
const { pool } = await import('../src/lib/db.ts')
const { nameTokens } = await import('../src/lib/domain/catalog.ts')

const GENERIC = new Set(`CREME SAB SH COND DES REF CAP ESMAL KIT ROSA AZUL ESC BIO GEL DENTAL OLEO LIQ BABY CPR G EXTRA M TINT PRETO KIDS PROT FRALDA ABS HID COLOR FACIAL REFIL
 LINE AERO MASC TOP MASCARA MORANGO SUAVE AGUA PERFUME SPRAY CHUP LISO LEITE NATURAL SOFT TRAT COR ABAS INFANTIL VERDE BRANCO CHUPETA PLUS CACHOS SERUM B ORIGINAL SILICONE DENT ULTRA MEN
 APAR SOLAR SALON PRO COCO ROLL VIA AROMA SIL PRES SUPER CHOCOLATE LAVANDA MEIA BEBE MEDIO ORAL ELASTICA BARRA CABELO J MAX ON BICO BODY LOC DOCE GLOSS TAM TRADICIONAL PRETA HAIR AEROSOL
 VITAMINA COPO CURATIVO SAC ESCURO BARB ML MENTA LABIAL N HIDRATACAO PO PROTETOR LIMPEZA HIDRA SENSITIVE ORTO CAPILAR MACIA PILHA SLIM ESFOLIANTE SABOR TECH LOURO CASTANHO PENTEAR
 LUVA FINALIZADOR ALCOOL ESSENCIA LENCO MAMAD TOALHA ESPONJA ALGODAO PRESERVATIVO FIO PINCEL TESOURA CORTADOR LIXA ESPELHO NECESSAIRE BOLSA ESTOJO MAIS COM SEM PARA TIPO LIMPADOR SABONETE SHAMPOO CONDICIONADOR DESODORANTE ESCOVA ESMALTE TINTURA FRALDAS ABSORVENTE`.split(/\s+/))

const { rows } = await pool.query(
  `select p.ean, p.description, p.group_name from products p where p.active and not exists (select 1 from product_images i where i.product_id = p.id) order by p.description`)
const toks = rows.map((r) => nameTokens(r.description).filter((t) => !/\d/.test(t) && t.length > 2))
const df = new Map()
for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1)
const brandOf = (t) => t.find((w) => !GENERIC.has(w) && (df.get(w) ?? 0) >= 6) ?? '(sem marca identificada)'
const list = rows.map((r, k) => ({ ...r, brand: brandOf(toks[k]) }))

const csv = (a) => a.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')
await mkdir(OUT, { recursive: true })
list.sort((a, b) => a.brand.localeCompare(b.brand) || a.description.localeCompare(b.description))
await writeFile(join(OUT, 'produtos-sem-foto.csv'), '﻿' + [csv(['Marca provável', 'EAN', 'Descrição', 'Grupo']), ...list.map((r) => csv([r.brand, r.ean ? `'${r.ean}` : '', r.description, r.group_name]))].join('\r\n'))
const by = new Map()
for (const r of list) by.set(r.brand, (by.get(r.brand) ?? 0) + 1)
const resumo = [...by.entries()].sort((a, b) => b[1] - a[1])
await writeFile(join(OUT, 'resumo-por-marca.csv'), '﻿' + [csv(['Marca provável', 'Produtos sem foto']), ...resumo.map(([b, n]) => csv([b, n]))].join('\r\n'))
await writeFile(join(OUT, 'modelo-email-fabricantes.txt'), `Assunto: Solicitação de banco de imagens de produtos (varejo) — [NOME DA REDE]

Olá, [nome do contato],

Somos a [NOME DA REDE] (Minas Farma e Farma e Farma), farmácias que vendem os produtos [MARCA] e divulgam as ofertas nas redes sociais e no material de loja.

Gostaríamos de receber, para uso na divulgação dos produtos da marca em nossas lojas, o banco de imagens oficial de produtos (embalagem em alta resolução, de preferência com fundo transparente ou branco, em PNG ou JPG) e, se houver, os materiais de campanha liberados para o varejo.

Para facilitar a identificação, segue em anexo a lista dos produtos [MARCA] que temos em estoque, com o código de barras (EAN). Se possível, nomeie cada arquivo com o EAN (ex.: 7891234567895.png); assim conseguimos ligar cada imagem ao produto automaticamente.

Poderiam nos informar o link do portal de imagens da marca ou enviar os arquivos? Também gostaríamos de saber se há alguma regra de uso (por exemplo, aprovação prévia de peças com preço).

Agradecemos desde já.

[Seu nome] — [cargo]
[Telefone / e-mail]
`)
console.log(`${rows.length} produtos sem foto · ${resumo.length} marcas prováveis`)
console.log(resumo.slice(0, 30).map(([b, n]) => `${b}:${n}`).join('  '))
const top = resumo.slice(0, 40).reduce((s, [, n]) => s + n, 0)
console.log(`As 40 primeiras marcas cobrem ${top} produtos (${Math.round((top / rows.length) * 100)}%). Arquivos em ${OUT}`)
await pool.end()
