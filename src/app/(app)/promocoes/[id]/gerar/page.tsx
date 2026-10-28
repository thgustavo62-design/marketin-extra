import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/perms";
import { isUuid } from "@/lib/form";
import { getCampaign } from "@/lib/promo/store";
import { sourceHash } from "@/lib/studio/store";
import { pool } from "@/lib/db";
import { GenerateCampaign } from "./generate-campaign";
export default async function Generate({params}:{params:Promise<{id:string}>}) {
  const user=await requireUser(),{id}=await params;
  if(!isUuid(id))notFound();
  const source=await getCampaign(id,{workspace:false});
  if(!source || source.campaign.kind!=="promocao")notFound();
  if(!canWrite(user.role))return <p>Seu acesso permite visualizar as campanhas, sem gerar novas páginas.</p>;
  const saved=await pool.query("select format,page from studio_pages where campaign_id=$1",[id]);
  return <GenerateCampaign source={source} hash={sourceHash(source)} saved={saved.rows.map(r=>`${r.format}:${r.page}`)} />;
}
