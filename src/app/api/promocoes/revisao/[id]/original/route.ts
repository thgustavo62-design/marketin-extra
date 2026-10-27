import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { pool } from "@/lib/db";
import { readReview } from "@/lib/promo/review-store";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user || user.mustChange)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params,
    r = await readReview(id, user);
  if (!r)
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const file = (
    await pool.query("select original_file from promo_imports where id=$1", [
      id,
    ])
  ).rows[0];
  return new NextResponse(new Uint8Array(file.original_file), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="planilha-original.${/\.xls$/i.test(r.filename) ? "xls" : "xlsx"}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
