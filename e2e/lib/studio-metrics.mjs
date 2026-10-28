import fs from "node:fs/promises";
// Same browser and cold HTTP cache for repeatable before/after payload comparison.
// readyMs is a single local observation, not a production latency guarantee.
export async function measureStudio(context, url, path) {
  const page = await context.newPage(),
    session = await context.newCDPSession(page);
  try {
    await session.send("Network.enable");
    await session.send("Network.setCacheDisabled", { cacheDisabled: true });
    const start = Date.now();
    await page.goto(url);
    await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
    const files = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .filter(
          (r) =>
            r.name.includes("/_next/static/") &&
            r.name.split("?")[0].endsWith(".js"),
        )
        .map((r) => ({
          name: r.name.split("/").at(-1),
          decoded: r.decodedBodySize,
          transfer: r.transferSize,
        })),
    );
    await fs.writeFile(
      path,
      JSON.stringify(
        {
          readyMs: Date.now() - start,
          jsFiles: files.length,
          decodedJs: files.reduce((n, r) => n + r.decoded, 0),
          transferredJs: files.reduce((n, r) => n + r.transfer, 0),
          files,
        },
        null,
        2,
      ),
    );
  } finally {
    await session.detach();
    await page.close();
  }
}
