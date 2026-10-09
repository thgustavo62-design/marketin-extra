// Roteiro de Reels.
// ---------- Reels ----------
export type ReelsScene = { time: string; scene: string; speech: string; onscreen: string }
export type ReelsScript = { hook: string; scenes: ReelsScene[]; cta: string }

export const REELS_TEMPLATE_TIMES = ['0–3 s', '3–12 s', '12–22 s', '22–30 s']

export function emptyReels(): ReelsScript {
  return {
    hook: '',
    scenes: REELS_TEMPLATE_TIMES.map((time) => ({ time, scene: '', speech: '', onscreen: '' })),
    cta: '',
  }
}

export function normalizeReels(raw: unknown): ReelsScript {
  const base = emptyReels()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<ReelsScript>
  return {
    hook: typeof r.hook === 'string' ? r.hook : '',
    cta: typeof r.cta === 'string' ? r.cta : '',
    scenes: Array.isArray(r.scenes) && r.scenes.length
      ? r.scenes.map((s, i) => ({
          time: String(s?.time ?? REELS_TEMPLATE_TIMES[i] ?? ''),
          scene: String(s?.scene ?? ''),
          speech: String(s?.speech ?? ''),
          onscreen: String(s?.onscreen ?? ''),
        }))
      : base.scenes,
  }
}
