import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
const AAD = Buffer.from('nova7:windsor:v1')
export function encryptionKey(value = process.env.INTEGRATIONS_ENCRYPTION_KEY): Buffer {
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new Error('Proteção de credenciais não configurada no servidor.')
  return Buffer.from(value, 'hex')
}
export function sealSecret(value: string, key = encryptionKey()): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(AAD)
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}
export function openSecret(value: string, key = encryptionKey()): string {
  const [version, iv, tag, data, extra] = value.split('.')
  if (version !== 'v1' || !iv || !tag || !data || extra) throw new Error('Credencial inválida.')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
  decipher.setAAD(AAD)
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}
export function validWindsorKey(value: string): boolean {
  return value.length >= 8 && value.length <= 512 && /^[A-Za-z0-9._~-]+$/.test(value)
}
