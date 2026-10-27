import {notFound,redirect} from 'next/navigation'
import {requireUser} from '@/lib/auth'
import {isUuid} from '@/lib/form'
import {getCampaign} from '@/lib/promo/store'
export default async function Editor({params}:{params:Promise<{id:string}>}){await requireUser();const {id}=await params;if(!isUuid(id))notFound();const data=await getCampaign(id);if(!data||data.campaign.kind==='template')notFound();redirect(`/studio/${id}`)}
