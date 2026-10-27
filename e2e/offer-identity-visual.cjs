const fs = require("fs"),
  http = require("http");
const root = process.cwd(),
  out = "/tmp/nova7-offer-visual";
require("node:child_process").execFileSync(
  root + "/node_modules/.bin/tsc",
  [
    "--ignoreConfig",
    "--target",
    "ES2022",
    "--module",
    "esnext",
    "--moduleResolution",
    "bundler",
    "--skipLibCheck",
    "--lib",
    "dom,es2022",
    "--outDir",
    out,
    "--rootDir",
    "src/lib",
    "--rewriteRelativeImportExtensions",
    "src/lib/promo/offer-identity-render.ts",
  ],
  { cwd: root, stdio: "inherit" },
);
const html = `<!DOCTYPE html><style>body{margin:0;background:#ddd}canvas{width:900px;height:1000px}</style><canvas id="c" width="900" height="1000"></canvas><script>var exports={};</script><script src="/svgcanvas.js"></script><script src="/fabric.js"></script><script type="module">import{drawGlossyPrice,drawGoldRibbon,drawOfferDescription}from'/promo/offer-identity-render.js';import{DEFAULT_OFFER_IDENTITY}from'/domain/offer-identity.js';await new FontFace('PromoText','url(/font.ttf)',{weight:'100 900'}).load().then(f=>document.fonts.add(f));const c=document.querySelector('canvas'),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,1000);[.99,4.99,29.99,199.99,1299.99].forEach((p,i)=>{drawGlossyPrice(ctx,{x:30,y:30+i*190,w:330,h:140},p,DEFAULT_OFFER_IDENTITY);drawGoldRibbon(ctx,{x:400,y:35+i*190,w:440,h:65},'FRAGRÂNCIAS SELECIONADAS');drawOfferDescription(ctx,{x:410,y:110+i*190,w:400,h:60},'SHAMPOO HIDRATANTE 350 ML',100)});const v=new exports.Context(900,1000);[.99,4.99,29.99,199.99,1299.99].forEach((p,i)=>drawGlossyPrice(v,{x:30,y:30+i*190,w:330,h:140},p,DEFAULT_OFFER_IDENTITY));const objects=await new Promise(r=>fabric.loadSVGFromString(v.getSerializedSvg(true),r));const text=objects.filter(o=>o.type==='text');if(text.length!==25)throw Error('Expected 25 independent editable price text objects, found '+text.length);window.textParts=text.map(o=>o.text);window.done=true;</script>`;
const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end(html);
    return;
  }
  const f =
    req.url === "/svgcanvas.js"
      ? root + "/node_modules/svgcanvas/dist/svgcanvas.js"
      : req.url === "/fabric.js"
        ? root + "/node_modules/fabric/dist/fabric.js"
        : req.url === "/font.ttf"
          ? root + "/public/fonts/Montserrat.ttf"
          : out + req.url;
  try {
    res.setHeader(
      "Content-Type",
      req.url.endsWith(".js") ? "text/javascript" : "font/ttf",
    );
    res.end(fs.readFileSync(f));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
server.listen(3149, "127.0.0.1", async () => {
  let browser;
  try {
    browser = await require(
      root + "/node_modules/playwright-core",
    ).chromium.launch({
      executablePath: "/tmp/nova7-chromium/chromium",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage({
      viewport: { width: 920, height: 1020 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:3149");
    await page.waitForFunction(() => window.done);
    await page.screenshot({ path: out + "/prices.png" });
    if (errors.length) throw Error(errors.join("\n"));
    console.log(
      "PASS five dynamic prices rendered; 25 independently editable SVG/Fabric text objects",
      out + "/prices.png",
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
});
