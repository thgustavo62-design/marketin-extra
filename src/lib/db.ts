import pg from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: pg.Pool | undefined
}

// Pool único (sobrevive ao hot reload em dev). Só roda no servidor.
export const pool: pg.Pool =
  globalThis.__pgPool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
  })

if (process.env.NODE_ENV !== 'production') globalThis.__pgPool = pool
