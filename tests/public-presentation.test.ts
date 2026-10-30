import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { normalizeWhatsapp, validPresentationToken, whatsappLink, PUBLIC_PLANS } from '../src/lib/domain/public-presentation.ts';

test('WhatsApp confirmado mantém todos os dígitos e acrescenta apenas o código do país', () => {
  assert.equal(normalizeWhatsapp('(27) 99701-0954'), '5527997010954');
  assert.equal(normalizeWhatsapp('+55 27 99701-0954'), '5527997010954');
  assert.equal(normalizeWhatsapp('27 99710954'), null);
  assert.equal(normalizeWhatsapp('javascript:5527997010954'), null);
  assert.equal(normalizeWhatsapp(''), null);
});
test('Saiba mais usa wa.me e codifica a mensagem sem criar parâmetros adicionais', () => {
  const url = new URL(whatsappLink('27997010954', 'Olá! Plano Expansão & sua marca?'));
  assert.equal(url.hostname, 'wa.me');
  assert.equal(url.pathname, '/5527997010954');
  assert.equal(url.searchParams.get('text'), 'Olá! Plano Expansão & sua marca?');
  assert.equal([...url.searchParams].length, 1);
  assert.throws(() => whatsappLink('123', 'Olá'));
});
test('Links públicos têm espaço de 256 bits, sem aceitar caminhos ou entradas excessivas', () => {
  assert.equal(validPresentationToken(randomBytes(32).toString('base64url')), true);
  for (const token of ['', 'x'.repeat(42), '../admin', 'a'.repeat(10000), '<'.repeat(43)]) assert.equal(validPresentationToken(token), false);
});
test('Planos da apresentação seguem os valores e as faixas mais recentes, sem checkout', () => {
  assert.deepEqual(PUBLIC_PLANS.map(({ price, companies }) => [price, companies]), [
    ['49,99', '1 empresa'], ['89,99', '2 a 3 empresas'], ['129,99', '4 a 6 empresas'],
  ]);
});
