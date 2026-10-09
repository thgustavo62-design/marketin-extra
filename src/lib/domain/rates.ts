// Indicadores dos resultados.
// ---------- resultados ----------
// (salvamentos + compartilhamentos) / alcance × 100; sem alcance → null (exibir "—").
export function actionRate(reach: number | null, saves: number | null, shares: number | null): number | null {
  if (!reach || reach <= 0) return null
  return ((saves ?? 0) + (shares ?? 0)) / reach * 100
}

export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${rate.toFixed(1).replace('.', ',')}%`
}
