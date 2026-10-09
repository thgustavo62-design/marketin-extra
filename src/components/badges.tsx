import { FORMATS, STAGES, type Format, type Stage } from '@/lib/domain'

export function StageBadge({ stage }: { stage: Stage }) {
  return <span className={`badge stage-${stage}`}>{STAGES[stage]}</span>
}

export function FormatBadge({ format }: { format: Format }) {
  return <span className={`badge fmt-${format}`}>{FORMATS[format]}</span>
}
