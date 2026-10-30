import { requireAdmin } from '@/lib/auth';
import { ActionForm } from '@/components/action-form';
import { CopyPresentationLink } from '@/components/public-presentation/copy-link';
import { DEFAULT_PRESENTATION_PHONE, DEFAULT_PRESENTATION_MESSAGE, getPresentationSettings } from '@/lib/public-presentation/admin';
import { presentationOrigin } from '@/lib/public-presentation/origin';
import { presentationAction } from './actions';

export default async function SitePresentationSettings() {
  await requireAdmin();
  const settings = await getPresentationSettings();
  const version = settings?.version ?? 0;
  const url = settings ? presentationOrigin() + '/apresentacao/' + settings.public_token : null;
  return <>
    <header className="page-head"><h1>Site de apresentação</h1><p>Apresentação comercial da Encartiva. Visitantes veem somente o site institucional, sem acesso ao workspace.</p></header>
    <section className="card tenancy-section">
      <h2>{settings?.published ? 'Publicado' : settings ? 'Rascunho — não publicado' : 'Nenhum link gerado'}</h2>
      {settings && <p>Última alteração: {new Date(settings.updated_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</p>}
      <p><a className="btn" href="/apresentacao-preview" target="_blank" rel="noopener noreferrer">Visualizar prévia privada ↗</a></p>
      {url && <><CopyPresentationLink url={url} /><p className="muted">{settings?.published ? 'Este endereço mostra apenas a apresentação comercial.' : 'O link retornará página não encontrada até você publicar.'}</p></>}
    </section>
    <section className="card tenancy-section">
      <h2>Botões Saiba mais</h2><p>Os botões abrem uma conversa no WhatsApp. Os planos incluem uma mensagem com a opção de interesse.</p>
      <ActionForm action={presentationAction} submit={settings ? 'Salvar contato' : 'Gerar link'}>
        <input type="hidden" name="operation" value={settings ? 'save' : 'generate'} />
        <input type="hidden" name="version" value={version} />
        <label>WhatsApp com DDD<input name="phone" type="tel" autoComplete="tel" required maxLength={24} defaultValue={settings?.whatsapp_phone ?? DEFAULT_PRESENTATION_PHONE} /></label>
        <label>Mensagem inicial<textarea name="message" required maxLength={300} rows={3} defaultValue={settings?.cta_message ?? DEFAULT_PRESENTATION_MESSAGE} /></label>
      </ActionForm>
    </section>
    {settings && <>
      <section className="card tenancy-section">
        <h2>Publicação</h2><p>{settings.published ? 'Despublicar bloqueia novos acessos imediatamente. O mesmo link poderá ser publicado novamente.' : 'Confira a prévia e o WhatsApp antes de liberar o endereço.'}</p>
        <ActionForm action={presentationAction} submit={settings.published ? 'Despublicar apresentação' : 'Publicar apresentação'}>
          <input type="hidden" name="operation" value={settings.published ? 'unpublish' : 'publish'} />
          <input type="hidden" name="version" value={version} />
        </ActionForm>
      </section>
      <section className="card tenancy-section">
        <h2>Substituir o endereço</h2><p>O endereço anterior deixará de funcionar. O novo link ficará em rascunho até você publicá-lo.</p>
        <ActionForm action={presentationAction} submit="Regenerar e invalidar link anterior">
          <input type="hidden" name="operation" value="regenerate" />
          <input type="hidden" name="version" value={version} />
          <label className="check"><input type="checkbox" name="confirmed" value="yes" />Confirmo a invalidação do link anterior.</label>
        </ActionForm>
      </section>
    </>}
    <p className="muted" style={{ marginTop: 24 }}>Os valores nesta apresentação são comerciais. Esta área não contrata planos nem cria cobranças.</p>
  </>;
}
