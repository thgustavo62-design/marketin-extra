"use server";
import { requireAdmin } from "@/lib/auth";
export async function testImageConnection() {
  await requireAdmin();
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token)
    return {
      ok: false,
      message: "A chave Replicate ainda não foi configurada no servidor.",
    };
  try {
    const r = await fetch("https://api.replicate.com/v1/account", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    return r.ok
      ? {
          ok: true,
          message:
            "Conexão autenticada com sucesso. O teste não gera imagens nem consome uma previsão de modelo.",
        }
      : {
          ok: false,
          message:
            r.status === 401 || r.status === 403
              ? "A chave foi recusada pelo serviço. Confira a credencial na Vercel."
              : "O serviço não respondeu ao teste. Tente novamente mais tarde.",
        };
  } catch {
    return {
      ok: false,
      message: "Não foi possível alcançar o serviço de imagens.",
    };
  }
}
