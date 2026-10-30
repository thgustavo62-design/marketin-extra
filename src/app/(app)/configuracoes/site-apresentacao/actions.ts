'use server';
import { revalidatePath } from 'next/cache';
import { adminOrError } from '@/lib/auth';
import { str, type FormState } from '@/lib/form';
import { changePresentation } from '@/lib/public-presentation/admin';

export async function presentationAction(_previous: FormState, data: FormData): Promise<FormState> {
  const guard = await adminOrError();
  if (!guard.ok) return { error: guard.error };
  const operation = str(data, 'operation');
  try {
    await changePresentation(guard.user.id, {
      operation, version: Number(data.get('version')), phone: str(data, 'phone'),
      message: str(data, 'message'), confirmed: data.get('confirmed') === 'yes',
    });
    revalidatePath('/configuracoes/site-apresentacao');
    revalidatePath('/apresentacao-preview');
    const messages: Record<string, string> = {
      generate: 'Link gerado. Confira a prévia e publique quando estiver pronto.',
      save: 'Contato atualizado. Os botões Saiba mais usarão este WhatsApp.',
      publish: 'Apresentação publicada. O link já pode ser compartilhado.',
      unpublish: 'Apresentação despublicada. Novos acessos ao link estão bloqueados.',
      regenerate: 'Link anterior invalidado. O novo link está em rascunho; publique para compartilhar.',
    };
    return { ok: messages[operation] };
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return { error: 'Outra configuração foi salva. Atualize a página.' };
    return { error: error instanceof Error ? error.message : 'Não foi possível atualizar a apresentação.' };
  }
}
