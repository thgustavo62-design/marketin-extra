import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/perms";
import { listDesigns } from "@/lib/promo/store";
import { studioAiReadiness } from "@/lib/domain/studio-ai";
import { designResourceCounts } from "@/lib/studio/designs";
import { DesignHub } from "./design-hub";
export default async function DesignPage() {
  const user = await requireUser(),
    [designs, counts] = await Promise.all([
      listDesigns(),
      designResourceCounts(),
    ]),
    ai = studioAiReadiness(process.env);
  return (
    <DesignHub
      canEdit={canWrite(user.role)}
      recent={designs.slice(0, 6)}
      total={counts.designs}
      models={counts.templates}
      aiReady={ai.generate && ai.removeBg}
    />
  );
}
