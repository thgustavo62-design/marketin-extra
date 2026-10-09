// Armazenamento de arquivos atrás de uma interface: trocar de provedor não mexe nas telas.
// Hoje: Postgres (tabela media_blobs, privada). Limite de 4 MB por arquivo por causa da Vercel.
// Para vídeos grandes e muito volume, implementar a mesma interface com Supabase Storage ou R2
// (exige uma chave secreta só do servidor) e apontar `getStorage()` para ela.
import { pool } from '../db'

export type StorageProviderName = 'postgres'

export interface StorageProvider {
  readonly name: StorageProviderName
  put(assetId: string, data: Buffer): Promise<void>
  get(assetId: string): Promise<Buffer | null>
}

const postgresStorage: StorageProvider = {
  name: 'postgres',
  async put(assetId, data) {
    await pool.query(`insert into media_blobs (asset_id, data) values ($1, $2) on conflict (asset_id) do update set data = excluded.data`, [assetId, data])
  },
  async get(assetId) {
    const r = await pool.query(`select data from media_blobs where asset_id = $1`, [assetId])
    return r.rows[0]?.data ?? null
  },
}

export const getStorage = (): StorageProvider => postgresStorage
