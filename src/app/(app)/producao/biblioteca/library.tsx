'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Star } from 'lucide-react'
import type { Asset } from '@/lib/data'
import { formatBytes } from '@/lib/domain'
import { AssetDialog, AssetPreview } from './asset-dialog'
import { UploadPanel } from './upload-panel'

type Brand = { id: string; name: string }
type Branch = { id: string; brand_id: string; name: string }

export function Library({ assets, canEdit, brands, branches, defaultBrandId }: { assets: Asset[]; canEdit: boolean; brands: Brand[]; branches: Branch[]; defaultBrandId?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState<string | null>(null)
  return (
    <>
      {canEdit && <UploadPanel brands={brands} branches={branches} defaultBrandId={defaultBrandId} />}
      {assets.length === 0 ? (
        <p className="empty">Nenhuma mídia neste recorte. Envie uma arte (PNG, JPG, WEBP, GIF ou PDF até 4 MB) ou cadastre o link de um vídeo.</p>
      ) : (
        <div className="asset-grid">
          {assets.map((a) => (
            <article key={a.id} className="asset-card">
              <button type="button" className="asset-main" onClick={() => setOpen(a.id)} aria-label={`Abrir ${a.title}`}>
                <span className="asset-thumb"><AssetPreview id={a.id} kind={a.kind} mime={a.mime_type} title={a.title} url={a.external_url} /></span>
                <strong>{a.title}</strong>
                <small className="muted">{a.brand_name}{a.branch_name ? ` · ${a.branch_name}` : ''}</small>
              </button>
              <div className="asset-meta">
                <span className="badge">v{a.version_number}{a.versions > 1 ? ` de ${a.versions}` : ''}</span>
                {a.is_final && <span className="pill on"><Star size={11} /> Final</span>}
                {a.reusable_approved && <span className="pill soft">Reutilizável</span>}
                <small className="muted">{a.kind === 'file' ? formatBytes(a.size_bytes ?? 0) : 'link'}{a.uses > 0 ? ` · em ${a.uses} conteúdo${a.uses > 1 ? 's' : ''}` : ''}</small>
              </div>
              {a.tags.length > 0 && <div className="tag-row">{a.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
            </article>
          ))}
        </div>
      )}
      <AssetDialog assetId={open} canEdit={canEdit} onClose={() => setOpen(null)} onChanged={() => router.refresh()} />
    </>
  )
}
