import pg from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: pg.Pool | undefined
}

// Verificação do certificado: se DATABASE_CA (PEM do Supabase) estiver definido, o certificado é validado.
// Sem ele, a conexão continua criptografada, mas sem checar a identidade do servidor.
const ca = process.env.DATABASE_CA?.replace(/\\n/g, '\n')

// Pool único (sobrevive ao hot reload em dev). Só roda no servidor.
// Os limites de tempo evitam que uma consulta presa trave a página inteira.
export const pool: pg.Pool =
  globalThis.__pgPool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
  })

if (process.env.NODE_ENV !== 'production') globalThis.__pgPool = pool
