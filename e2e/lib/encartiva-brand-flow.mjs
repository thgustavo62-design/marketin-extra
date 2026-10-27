import assert from 'node:assert/strict';
import fs from 'node:fs';

// Exercise the actual app (not a static mock), both anonymous and signed in.
export async function checkEncartivaBrand(browser, signedInPage, base) {
  const context = signedInPage.context();
  const cookies = await context.cookies();
  const page = signedInPage;
  await context.clearCookies();
  let checks = 0;
  try {
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const response = await page.goto(base + '/login');
      assert.equal(response.status(), 200);
      assert.equal(await page.title(), 'Encartiva');
      await page.getByRole('heading', { name: 'Criar mais. Complicar menos.' }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() => ({
        fits: document.documentElement.scrollWidth <= innerWidth,
        bodyFont: getComputedStyle(document.body).fontFamily,
        headingFont: getComputedStyle(document.querySelector('h1')).fontFamily,
        logo: [...document.querySelectorAll('img')].every(i => i.complete && i.naturalWidth > 0),
      }));
      assert.ok(layout.fits, `Login overflows at ${width}px`);
      assert.ok(layout.logo, 'Supplied logo must load');
      assert.notEqual(layout.bodyFont, layout.headingFont);
      assert.ok(!await page.locator('body').innerText().then(t => /nova7/i.test(t)));
      const submit = page.getByRole('button', { name: 'Entrar', exact: true });
      await submit.scrollIntoViewIfNeeded();
      assert.ok(await submit.isVisible());
      fs.mkdirSync('/tmp/encartiva-qa', { recursive: true });
      await page.screenshot({ path: `/tmp/encartiva-qa/login-${width}.png`, fullPage: true });
      checks++;
    }
    const manifest = await (await page.request.get(base + '/manifest.webmanifest')).json();
    assert.equal(manifest.short_name, 'Encartiva');
    assert.equal(manifest.theme_color, '#111214');
    assert.equal((await page.request.get(base + manifest.icons[0].src)).status(), 200);
    checks++;
    await context.addCookies(cookies);
    for (const width of [1440, 390]) {
      await signedInPage.setViewportSize({ width, height: 1000 });
      await signedInPage.goto(base + '/empresas');
      await signedInPage.getByRole('heading', { name: 'Minhas Empresas', exact: true }).waitFor();
      assert.ok(await signedInPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 390) {
        await signedInPage.getByRole('button', { name: 'Abrir menu', exact: true }).click();
        await signedInPage.getByRole('navigation', { name: 'Principal', exact: true }).waitFor();
        assert.ok(await signedInPage.getByRole('img', { name: 'Encartiva', exact: true }).isVisible());
        await signedInPage.getByRole('button', { name: 'Fechar menu', exact: true }).click();
      }
      await signedInPage.screenshot({ path: `/tmp/encartiva-qa/workspace-${width}.png`, fullPage: true });
      checks++;
    }
    console.log(`PASS ${checks} Encartiva identity and responsive browser checks`);
    return checks;
  } finally {
    await signedInPage.setViewportSize({ width: 1440, height: 1100 });
    await context.addCookies(cookies);
  }
}
