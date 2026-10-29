import assert from 'node:assert/strict';

// Disposable PostgreSQL + real Server Actions. No production records are used.
export async function settingsAccessFlow({ db, page, browser, base, otherCompanyId, multiCompanyId, check }) {
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const status = async (form, text) => {
    try { await form.getByRole('status').filter({ hasText: text }).waitFor(); }
    catch (error) { throw Error(`${text}: ${(await form.getByRole('alert').allTextContents()).join(' ') || error.message}`); }
  };
  const formFor = (root, button) => root.getByRole('button', { name: button, exact: true }).locator('xpath=ancestor::form[1]');
  const company = await one("select * from companies where name='Empresa criada pela interface'");
  assert.ok(company); check();
  await page.goto(base + '/configuracoes');
  await page.waitForURL('**/configuracoes/empresas');
  await page.getByRole('navigation', { name: 'Configurações', exact: true }).getByRole('link', { name: 'Proprietários', exact: true }).waitFor();
  check();
  await page.getByRole('link', { name: company.name, exact: true }).click();
  await page.waitForURL('**/configuracoes/empresas/' + company.id);
  const profile = formFor(page, 'Salvar empresa');
  await profile.getByLabel('Nome da empresa', { exact: true }).fill('Mercado Configurações');
  await profile.getByRole('button', { name: 'Salvar empresa', exact: true }).click();
  await status(profile, 'Dados da empresa atualizados');
  assert.equal((await one('select name from companies where id=$1', [company.id])).name, 'Mercado Configurações'); check();

  // The header still points at Minas Farma; mutations must target this company.
  await page.getByText('Cadastrar nova filial', { exact: true }).click();
  let branchForm = formFor(page, 'Cadastrar filial');
  await branchForm.getByLabel('Nome da filial', { exact: true }).fill('Centro Configurações');
  await branchForm.getByLabel('Cidade', { exact: true }).fill('Baixo Guandu');
  await branchForm.getByRole('button', { name: 'Cadastrar filial', exact: true }).click();
  await status(branchForm, 'Filial cadastrada');
  const branch = await one("select * from branches where brand_id=$1 and name='Centro Configurações'", [company.id]);
  assert.ok(branch); check();
  await page.getByText('Editar filial Centro Configurações', { exact: true }).click();
  const editBranch = formFor(page, 'Salvar filial');
  await editBranch.getByLabel('Nome da filial', { exact: true }).fill('Centro atualizado');
  await editBranch.getByRole('button', { name: 'Salvar filial', exact: true }).click();
  await status(editBranch, 'Filial atualizada');
  assert.equal((await one('select name from branches where id=$1', [branch.id])).name, 'Centro atualizado'); check();

  const staffForm = formFor(page, 'Criar ou vincular login');
  await staffForm.getByLabel('Login', { exact: true }).fill('staff_settings');
  await staffForm.getByLabel('Nome', { exact: true }).fill('Funcionário Configurações');
  await staffForm.locator('input[name="password"]').fill('Teste-Seguro-2026');
  await staffForm.getByLabel('Escopo', { exact: true }).selectOption(branch.id);
  await staffForm.getByLabel('Produtos', { exact: true }).selectOption('read');
  await staffForm.getByLabel('Promoções', { exact: true }).selectOption('write');
  await staffForm.getByRole('button', { name: 'Criar ou vincular login', exact: true }).click();
  await status(staffForm, 'Vínculo e permissões salvos');
  const staff = await one("select id,password_hash,must_change_password from users where username='staff_settings'");
  assert.ok(staff.password_hash && staff.password_hash !== 'Teste-Seguro-2026');
  assert.equal(staff.must_change_password, true); check();
  const membership = await one('select * from employee_memberships where user_id=$1', [staff.id]);
  assert.equal(membership.company_id, company.id);
  assert.equal(membership.branch_id, branch.id);
  assert.equal(membership.permissions.promotions, 'write'); check();
  console.log('PASS settings company, branch and employee persisted');

  const entry = page.locator(`[data-membership="${membership.id}"]`);
  await entry.getByText('Editar permissões de Funcionário Configurações', { exact: true }).click();
  const editAccess = formFor(entry, 'Salvar permissões');
  await editAccess.getByLabel('Promoções', { exact: true }).selectOption('read');
  await editAccess.getByRole('button', { name: 'Salvar permissões', exact: true }).click();
  await status(editAccess, 'Vínculo e permissões salvos');
  const saved = await one('select * from employee_memberships where id=$1', [membership.id]);
  assert.equal(saved.permissions.promotions, 'read');
  assert.equal(saved.branch_id, branch.id); check();

  const staffContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const staffPage = await staffContext.newPage();
  try {
    await staffPage.goto(base + '/login');
    await staffPage.locator('input[name="username"]').fill('staff_settings');
    await staffPage.locator('input[name="password"]').fill('Teste-Seguro-2026');
    await staffPage.getByRole('button', { name: 'Entrar', exact: true }).click();
    await staffPage.waitForURL('**/configuracoes/conta?trocar=1'); check();
    await staffPage.getByLabel('Senha atual', { exact: true }).fill('Teste-Seguro-2026');
    await staffPage.locator('input[name="next"]').fill('Nova-Segura-2026');
    await staffPage.getByLabel('Confirmar nova senha', { exact: true }).fill('Nova-Segura-2026');
    await staffPage.getByRole('button', { name: 'Alterar senha', exact: true }).click();
    await staffPage.waitForURL(base + '/'); check();
    const me = await (await staffContext.request.get(base + '/api/me')).json();
    assert.equal(me.username, 'staff_settings');
    assert.equal(me.role, 'employee'); check();
    await staffPage.goto(base + '/configuracoes/empresas/' + otherCompanyId);
    await staffPage.getByRole('heading', { name: 'Página não encontrada', exact: true }).waitFor(); check();
    await staffPage.goto(base + '/configuracoes/empresas/' + company.id);
    assert.equal(await staffPage.getByRole('button', { name: 'Salvar empresa', exact: true }).count(), 0);
    assert.equal(await staffPage.getByRole('button', { name: 'Criar ou vincular login', exact: true }).count(), 0); check();

    await page.goto(base + '/configuracoes/usuarios');
    const userRow = page.getByRole('row').filter({ hasText: '@staff_settings' });
    await userRow.getByRole('link', { name: 'Mercado Configurações', exact: true }).waitFor();
    await userRow.getByText('Centro atualizado', { exact: false }).waitFor(); check();
    await userRow.getByRole('button', { name: 'Redefinir senha', exact: true }).click();
    await userRow.getByRole('status').filter({ hasText: 'Nova senha provisória' }).waitFor();
    assert.equal((await one('select must_change_password from users where id=$1', [staff.id])).must_change_password, true);
    assert.equal((await staffContext.request.get(base + '/api/me')).status(), 401); check();
    await userRow.getByRole('button', { name: 'Desativar', exact: true }).click();
    await userRow.getByText('Inativo', { exact: true }).waitFor();
    assert.equal((await one('select active from users where id=$1', [staff.id])).active, false); check();
    await userRow.getByRole('button', { name: 'Ativar', exact: true }).click();
    await userRow.getByText('Ativo', { exact: true }).waitFor();
    assert.equal((await one('select active from users where id=$1', [staff.id])).active, true); check();
  } finally { await staffContext.close().catch(() => {}); }
  console.log('PASS settings real login, first password change, reset and account activation');

  const credentialBeforeLink = (await one('select password_hash from users where id=$1', [staff.id])).password_hash;
  await page.goto(base + '/configuracoes/empresas/' + multiCompanyId);
  const additional = formFor(page, 'Criar ou vincular login');
  await additional.getByLabel('Login', { exact: true }).fill('staff_settings');
  await additional.getByLabel('Perfil', { exact: true }).selectOption('manager');
  await additional.getByRole('button', { name: 'Criar ou vincular login', exact: true }).click();
  await status(additional, 'Vínculo e permissões salvos');
  assert.equal((await one('select count(*)::int as n from employee_memberships where user_id=$1 and active', [staff.id])).n, 2);
  assert.equal((await one('select password_hash from users where id=$1', [staff.id])).password_hash, credentialBeforeLink); check();
  const managerLink = await one('select role,permissions from employee_memberships where user_id=$1 and company_id=$2', [staff.id, multiCompanyId]);
  assert.equal(managerLink.role, 'manager');
  assert.equal(managerLink.permissions.products, 'write'); check();
  await page.goto(base + '/configuracoes/empresas/' + company.id);
  const revoke = formFor(page.locator(`[data-membership="${membership.id}"]`), 'Revogar vínculo');
  await revoke.getByRole('button', { name: 'Revogar vínculo', exact: true }).click();
  await page.locator(`[data-membership="${membership.id}"]`).getByText('Revogado', { exact: false }).waitFor();
  assert.equal((await one('select active from employee_memberships where id=$1', [membership.id])).active, false); check();
  assert.equal((await one('select active from employee_memberships where user_id=$1 and company_id=$2', [staff.id, multiCompanyId])).active, true); check();
  const revokedEntry = page.locator(`[data-membership="${membership.id}"]`);
  await revokedEntry.getByText('Reativar vínculo de Funcionário Configurações', { exact: true }).click();
  const reactivate = formFor(revokedEntry, 'Salvar permissões');
  await reactivate.getByRole('button', { name: 'Salvar permissões', exact: true }).click();
  await status(reactivate, 'Vínculo e permissões salvos');
  assert.equal((await one('select active from employee_memberships where id=$1', [membership.id])).active, true);
  assert.equal((await one('select count(*)::int as n from employee_memberships where user_id=$1', [staff.id])).n, 2); check();

  // Settings work for an owner too, with no access to another owner's company.
  await page.goto(base + '/configuracoes/proprietarios/' + company.owner_id);
  const ownerForm = formFor(page, 'Salvar');
  await ownerForm.getByLabel('Limite de empresas', { exact: true }).fill('2');
  await ownerForm.getByRole('button', { name: 'Salvar', exact: true }).click();
  await status(ownerForm, 'Cadastro e contrato atualizados');
  const ownerContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const ownerPage = await ownerContext.newPage();
  try {
    await ownerPage.goto(base + '/login');
    await ownerPage.locator('input[name="username"]').fill('owner_browser');
    await ownerPage.locator('input[name="password"]').fill('Teste-Seguro-2026');
    await ownerPage.getByRole('button', { name: 'Entrar', exact: true }).click();
    await ownerPage.waitForURL('**/configuracoes/conta?trocar=1');
    await ownerPage.getByLabel('Senha atual', { exact: true }).fill('Teste-Seguro-2026');
    await ownerPage.locator('input[name="next"]').fill('Owner-Nova-2026');
    await ownerPage.getByLabel('Confirmar nova senha', { exact: true }).fill('Owner-Nova-2026');
    await ownerPage.getByRole('button', { name: 'Alterar senha', exact: true }).click();
    await ownerPage.waitForURL(base + '/'); check();
    await ownerPage.goto(base + '/configuracoes/empresas');
    const companyForm = formFor(ownerPage, 'Cadastrar empresa');
    await companyForm.getByLabel('Nome da empresa', { exact: true }).fill('Segunda empresa Configurações');
    await companyForm.getByLabel('Segmento', { exact: true }).fill('Farmácia');
    await companyForm.getByRole('button', { name: 'Cadastrar empresa', exact: true }).click();
    await status(companyForm, 'Empresa cadastrada');
    const second = await one("select * from companies where name='Segunda empresa Configurações'");
    assert.equal(second.owner_id, company.owner_id); check();
    await ownerPage.getByRole('link', { name: second.name, exact: true }).click();
    await ownerPage.getByText('Cadastrar nova filial', { exact: true }).click();
    branchForm = formFor(ownerPage, 'Cadastrar filial');
    await branchForm.getByLabel('Nome da filial', { exact: true }).fill('Filial da segunda empresa');
    await branchForm.getByRole('button', { name: 'Cadastrar filial', exact: true }).click();
    await status(branchForm, 'Filial cadastrada');
    const secondBranch = await one("select id from branches where brand_id=$1 and name='Filial da segunda empresa'", [second.id]);
    assert.ok(secondBranch); check();
    const ownerStaff = formFor(ownerPage, 'Criar ou vincular login');
    await ownerStaff.getByLabel('Login', { exact: true }).fill('owner_staff_settings');
    await ownerStaff.getByLabel('Nome', { exact: true }).fill('Funcionário do proprietário');
    await ownerStaff.locator('input[name="password"]').fill('Teste-Seguro-2026');
    await ownerStaff.getByLabel('Perfil', { exact: true }).selectOption('viewer');
    await ownerStaff.getByLabel('Escopo', { exact: true }).selectOption(secondBranch.id);
    await ownerStaff.getByRole('button', { name: 'Criar ou vincular login', exact: true }).click();
    await status(ownerStaff, 'Vínculo e permissões salvos');
    const ownedStaff = await one("select m.* from employee_memberships m join users u on u.id=m.user_id where u.username='owner_staff_settings'");
    assert.equal(ownedStaff.company_id, second.id);
    assert.equal(ownedStaff.branch_id, secondBranch.id);
    assert.equal(ownedStaff.role, 'viewer');
    assert.equal(ownedStaff.permissions.products, 'read'); check();
    const forged = formFor(ownerPage, 'Criar ou vincular login');
    await forged.getByLabel('Login', { exact: true }).fill('forged_settings');
    await forged.locator('input[name="password"]').fill('Teste-Seguro-2026');
    await forged.getByLabel('Produtos', { exact: true }).selectOption('read');
    await forged.locator('input[name="company_id"]').evaluate((input, id) => { input.value = id; }, otherCompanyId);
    await forged.getByRole('button', { name: 'Criar ou vincular login', exact: true }).click();
    await forged.getByRole('alert').filter({ hasText: 'Sem permissão' }).waitFor();
    assert.equal(await one("select id from users where username='forged_settings'"), undefined); check();
    await ownerPage.goto(base + '/configuracoes/empresas/' + otherCompanyId);
    await ownerPage.getByRole('heading', { name: 'Página não encontrada', exact: true }).waitFor(); check();
  } finally { await ownerContext.close().catch(() => {}); }
  console.log('PASS settings owner scope, multiple companies and tampered company denial');
  await page.goto(base + '/configuracoes/empresas/' + company.id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/nova7-settings-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); check();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({ path: '/tmp/nova7-settings-desktop.png', fullPage: true });
  await page.goto(base + '/configuracoes/usuarios');
  const userRow = page.getByRole('row').filter({ hasText: '@staff_settings' });
  await userRow.getByRole('button', { name: 'Editar', exact: true }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Nome', { exact: true }).fill('Funcionário atualizado');
  await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await status(dialog, 'Usuário atualizado');
  assert.equal((await one('select display_name from users where id=$1', [staff.id])).display_name, 'Funcionário atualizado');
  assert.equal((await one('select count(*)::int as n from employee_memberships where user_id=$1 and active', [staff.id])).n, 2); check();
}
