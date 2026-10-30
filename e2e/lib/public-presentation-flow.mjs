import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs/promises';

export async function publicPresentationFlow({ db, page, context, browser, base, ownerId, adminId, check }) {
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const formFor = (root, name) => root.getByRole('button', { name, exact: true }).locator('xpath=ancestor::form[1]');
  const done = async (form, text) => {
    try { await form.getByRole('status').filter({ hasText: text }).waitFor(); }
    catch (error) { throw Error(text + ': ' + (await form.getByRole('alert').allTextContents()).join(' ') + error.message); }
  };
  // Capture actual application screens exclusively in this disposable database.
  if (process.env.ENCARTIVA_SITE_CAPTURE === '1') {
    const owner = await one('select owner_id from owner_user_links where user_id=$1', [ownerId]);
    const company = await one("insert into companies(owner_id,name,slug,segment)values($1,'Loja Exemplo','demo-public-screens','Varejo')returning id", [owner.owner_id]);
    await db.query("insert into branches(brand_id,name,city)values($1,'Unidade Exemplo','Cidade Exemplo')", [company.id]);
    const { default: sharp } = await import('sharp');
    const names = ['Shampoo Exemplo 300ml', 'Sabonete Exemplo 90g', 'Creme dental Exemplo 70g', 'Café Exemplo 500g', 'Biscoito Exemplo 150g', 'Detergente Exemplo 500ml'];
    for (const [index, name] of names.entries()) {
      const product = await one('insert into products(description,name_key,search,company_id)values($1,$1,$1,$2)returning id', [name, company.id]);
      const color = ['#6b5dff', '#7f9f78', '#ba8f68'][index % 3];
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="440"><rect x="142" y="40" width="116" height="45" rx="8" fill="#111214"/><rect x="100" y="80" width="200" height="320" rx="38" fill="' + color + '"/><rect x="100" y="180" width="200" height="125" fill="#f8f5ea"/><text x="200" y="235" font-family="sans-serif" font-size="24" font-weight="bold" text-anchor="middle" fill="#111214">EXEMPLO</text><text x="200" y="268" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#111214">ILUSTRAÇÃO</text></svg>';
      const data = await sharp(Buffer.from(svg)).webp().toBuffer();
      await db.query("insert into product_images(product_id,company_id,is_primary,data,thumb,width,height,size_bytes,sha256,source)values($1,$2,true,$3,$3,400,440,$4,$5,'proprio')", [product.id, company.id, data, data.length, createHash('sha256').update(data).digest('hex')]);
    }
    for (const [name, start, end] of [['Ofertas da Semana — Exemplo', '2026-11-02', '2026-11-08'], ['Black Friday — Exemplo', '2026-11-01', '2026-11-30']])
      await db.query('insert into campaigns(brand_id,name,starts_on,ends_on,objective,briefing)values($1,$2,$3,$4,$5,$6)', [company.id, name, start, end, 'Comunicação promocional de exemplo', 'Campanha ilustrativa para demonstrar a organização da plataforma.']);
    for (const [index, title] of ['Ofertas da Semana', 'Identidade da Marca', 'Dia de Economizar'].entries()) {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1125"><rect width="900" height="1125" fill="' + (index === 1 ? '#111214' : '#6b5dff') + '"/><circle cx="760" cy="1050" r="370" fill="#dcceff"/><text x="70" y="120" font-family="sans-serif" font-size="30" fill="white">LOJA EXEMPLO</text><text x="65" y="380" font-family="sans-serif" font-weight="bold" font-size="75" fill="white">' + title.split(' ').slice(0, 2).join(' ').toUpperCase() + '</text><text x="65" y="480" font-family="sans-serif" font-weight="bold" font-size="75" fill="white">' + title.split(' ').slice(2).join(' ').toUpperCase() + '</text><text x="70" y="690" font-family="sans-serif" font-size="25" fill="white">EXEMPLO ILUSTRATIVO</text></svg>';
      const data = await sharp(Buffer.from(svg)).png().toBuffer();
      const asset = await one("insert into media_assets(brand_id,kind,title,original_name,mime_type,size_bytes,checksum_sha256,storage_provider,uploaded_by)values($1,'file',$2,$3,'image/png',$4,$5,'postgres',$6)returning id", [company.id, title + ' — Exemplo', 'exemplo-' + index + '.png', data.length, createHash('sha256').update(data).digest('hex'), adminId]);
      await db.query('insert into media_blobs(asset_id,data)values($1,$2)', [asset.id, data]);
    }
    const demoUser = await one("insert into users(username,username_normalized,display_name,password_hash,role,must_change_password,created_by)values('presentation_demo_capture','presentation_demo_capture','Demonstração','fixture-only','employee',false,$1)returning id", [adminId]);
    await db.query("insert into employee_memberships(user_id,company_id,role,permissions)values($1,$2,'manager',$3::jsonb)", [demoUser.id, company.id, JSON.stringify(Object.fromEntries(['planning', 'products', 'promotions', 'media', 'results', 'design', 'branch_admin'].map((key) => [key, 'write'])))]);
    const captureToken = randomBytes(32).toString('base64url');
    await db.query("insert into sessions(user_id,token_hash,expires_at)values($1,$2,now()+interval '1 hour')", [demoUser.id, createHash('sha256').update(captureToken).digest('hex')]);
    const captureContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1100 } });
    await captureContext.addCookies([{ name: '__Host-extra_session', value: captureToken, url: base, secure: true, httpOnly: true, sameSite: 'Lax' }]);
    await captureContext.addCookies([{ name: 'extra_scope', value: 'demo-public-screens|', url: base, secure: true, sameSite: 'Lax' }]);
    const capture = await captureContext.newPage();
    await fs.mkdir('public/presentation', { recursive: true });
    try {
      for (const [key, path] of [['promotions', '/promocoes/modelos'], ['products', '/produtos'], ['design', '/criacao'], ['campaigns', '/campanhas'], ['results', '/resultados/relatorios'], ['library', '/producao/biblioteca']]) {
        assert.equal((await capture.goto(base + path)).status(), 200);
        await capture.locator('main.content h1').first().waitFor();
        await capture.waitForLoadState('networkidle');
        if (key === 'promotions') {
          await capture.locator('canvas[data-model-preview]').first().scrollIntoViewIfNeeded();
          await capture.waitForFunction(() => Array.from(document.querySelectorAll('canvas[data-model-preview]')).slice(0, 3).every((canvas) => canvas.toDataURL().length > 10000));
        }
        await capture.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(Array.from(document.querySelectorAll('main img')).map((image) => image.decode().catch(() => {})));
        });
        const target = capture.locator('main.content');
        const bytes = await target.screenshot({ animations: 'disabled' });
        await sharp(bytes).resize(1200, 750, { fit: 'cover', position: 'north' }).webp({ quality: 82 }).toFile('public/presentation/' + key + '.webp');
        check();
      }
    } finally { await captureContext.close(); }
  }
  await page.goto(base + '/configuracoes/site-apresentacao');
  await page.getByRole('heading', { name: 'Site de apresentação', exact: true }).waitFor(); check();
  await page.getByRole('heading', { name: 'Nenhum link gerado', exact: true }).waitFor(); check();
  let captured;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.headers()['next-action'] && !captured) {
      captured = { headers: { 'next-action': request.headers()['next-action'], 'content-type': request.headers()['content-type'], origin: base }, data: request.postDataBuffer() };
    }
  });
  let form = formFor(page, 'Gerar link');
  await form.getByRole('button', { name: 'Gerar link', exact: true }).click();
  await page.getByLabel('Link público', { exact: true }).waitFor();
  const originalUrl = await page.getByLabel('Link público', { exact: true }).inputValue();
  const originalToken = new URL(originalUrl).pathname.split('/').at(-1);
  assert.match(originalToken, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(captured);
  const settings = await one('select * from nova7_private.public_presentation');
  assert.equal(settings.published, false);
  assert.equal(settings.whatsapp_phone, '5527997010954');
  assert.equal(settings.token_hash, createHash('sha256').update(originalToken).digest('hex')); check();
  await db.exec('begin;set local role nova7_app');
  try {
    await db.query("select set_config('nova7.session_hash',$1,true)", [ownerId]);
    assert.equal((await db.query('select public_token from nova7_private.public_presentation')).rows.length, 0);
    assert.equal((await db.query('update nova7_private.public_presentation set published=true')).rowCount, 0);
    await db.query("select set_config('nova7.session_hash','',true)");
    assert.equal((await db.query('select token_hash from nova7_private.public_presentation')).rows.length, 0);
    await db.exec('commit'); check();
  } catch (error) { await db.exec('rollback'); throw error; }
  assert.equal((await one("select has_table_privilege('anon','nova7_private.public_presentation','SELECT') as allowed")).allowed, false);
  assert.equal((await one("select has_function_privilege('anon','nova7_private.resolve_public_presentation(text)','EXECUTE') as allowed")).allowed, false); check();
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
  const visitor = await anonymous.newPage();
  const errors = [];
  visitor.on('pageerror', (error) => errors.push(error.message));
  try {
    assert.equal((await anonymous.request.get(originalUrl)).status(), 404); check();
    await anonymous.request.post(base + '/configuracoes/site-apresentacao', captured);
    assert.equal((await one('select version from nova7_private.public_presentation')).version, settings.version); check();
    assert.ok((await anonymous.request.get(base + '/apresentacao-preview')).url().endsWith('/login')); check();
    await page.goto(base + '/apresentacao-preview');
    await page.getByRole('heading', { name: /É a sua marca/ }).waitFor(); check();
    await page.goto(base + '/configuracoes/site-apresentacao');
    form = formFor(page, 'Publicar apresentação');
    await form.getByRole('button', { name: 'Publicar apresentação', exact: true }).click();
    await done(formFor(page, 'Despublicar apresentação'), 'Apresentação publicada');
    assert.equal((await anonymous.request.get(originalUrl)).status(), 200); check();
    assert.equal((await anonymous.request.get(base + '/apresentacao/' + 'z'.repeat(43))).status(), 404); check();
    assert.equal((await anonymous.request.post(originalUrl, captured)).status(), 405); check();
    const response = await visitor.goto(originalUrl);
    assert.equal(response.status(), 200);
    assert.match(response.headers()['cache-control'], /no-store/);
    await visitor.getByRole('heading', { name: /É a sua marca/ }).waitFor(); check();
    const html = await visitor.content();
    for (const forbidden of ['company-a', 'owner_browser', 'password_hash', 'DATABASE_URL', 'service_role', '__Host-extra_session', 'schema_migrations'])
      assert.ok(!html.includes(forbidden), forbidden + ' must not appear in public HTML');
    assert.equal(await visitor.getByRole('navigation', { name: 'Menu lateral', exact: true }).count(), 0); check();
    const links = visitor.getByRole('link', { name: /Saiba mais/ });
    assert.equal(await links.count(), 6);
    for (const link of await links.all()) {
      const url = new URL(await link.getAttribute('href'));
      assert.equal(url.hostname, 'wa.me');
      assert.equal(url.pathname, '/5527997010954');
      assert.ok(url.searchParams.get('text').includes('Encartiva'));
    } check();
    await visitor.getByRole('button', { name: 'Ver depois', exact: true }).click();
    assert.equal(await visitor.getByRole('slider').inputValue(), '100'); check();
    await visitor.getByRole('group', { name: 'Etapas da criação', exact: true }).getByRole('button', { name: /Revisão/ }).click();
    await visitor.getByRole('heading', { name: 'Você confere cada detalhe.', exact: true }).waitFor(); check();
    await visitor.getByRole('button', { name: 'Produtos', exact: true }).click();
    await visitor.getByRole('heading', { name: 'Seu catálogo, organizado.', exact: true }).waitFor(); check();
    assert.equal((await anonymous.request.get(base + '/api/me')).status(), 401);
    assert.equal((await anonymous.request.post(base + '/api/promocoes/biblioteca', { data: {}, headers: { origin: base } })).status(), 401); check();
    assert.ok((await anonymous.request.get(base + '/produtos')).url().endsWith('/login')); check();
    const frame = await anonymous.request.get(base + '/api/studio/templates/00000000-0000-4000-8000-000000000001');
    assert.equal(frame.status(), 401); check();
    await visitor.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [390, 768, 1440]) {
      await visitor.setViewportSize({ width, height: 1000 });
      assert.ok(await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow at ' + width);
      await visitor.screenshot({ path: '/tmp/encartiva-presentation-' + width + '.png', fullPage: true }); check();
    }
    await visitor.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await visitor.locator('.p-hero-copy').evaluate((element) => getComputedStyle(element).animationName), 'none'); check();
    form = formFor(page, 'Despublicar apresentação');
    await form.getByRole('button', { name: 'Despublicar apresentação', exact: true }).click();
    await done(formFor(page, 'Publicar apresentação'), 'Apresentação despublicada');
    assert.equal((await anonymous.request.get(originalUrl)).status(), 404); check();
    form = formFor(page, 'Regenerar e invalidar link anterior');
    await form.locator('input[name="confirmed"]').check();
    await form.getByRole('button', { name: 'Regenerar e invalidar link anterior', exact: true }).click();
    await done(form, 'Link anterior invalidado');
    const newUrl = await page.getByLabel('Link público', { exact: true }).inputValue();
    assert.notEqual(newUrl, originalUrl);
    assert.equal((await anonymous.request.get(newUrl)).status(), 404);
    assert.equal((await anonymous.request.get(originalUrl)).status(), 404); check();
    form = formFor(page, 'Publicar apresentação');
    await form.getByRole('button', { name: 'Publicar apresentação', exact: true }).click();
    await done(formFor(page, 'Despublicar apresentação'), 'Apresentação publicada');
    assert.equal((await anonymous.request.get(newUrl)).status(), 200);
    assert.equal((await anonymous.request.get(originalUrl)).status(), 404); check();
    const ownerToken = randomBytes(32).toString('base64url');
    await db.query('update users set must_change_password=false where id=$1', [ownerId]);
    await db.query("insert into sessions(user_id,token_hash,expires_at)values($1,$2,now()+interval '1 hour')", [ownerId, createHash('sha256').update(ownerToken).digest('hex')]);
    const ownerContext = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      await ownerContext.addCookies([{ name: '__Host-extra_session', value: ownerToken, url: base, secure: true, httpOnly: true, sameSite: 'Lax' }]);
      const before = await one('select version,token_hash,published from nova7_private.public_presentation');
      await ownerContext.request.post(base + '/configuracoes/site-apresentacao', captured);
      assert.deepEqual(await one('select version,token_hash,published from nova7_private.public_presentation'), before); check();
      assert.ok(!(await ownerContext.request.get(base + '/apresentacao-preview')).url().includes('/apresentacao-preview')); check();
    } finally { await ownerContext.close(); }
    assert.deepEqual(errors, []);
    console.log('PASS public presentation anonymous access, revocation, admin-only mutation, WhatsApp and responsive layout');
  } finally { await anonymous.close(); }
}
