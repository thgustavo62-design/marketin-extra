import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { execFileSync } from "node:child_process";

// Minimal Linux VMs may lack fontconfig/NSS. Extract only the pinned test
// browser's bundled libraries; no system packages or production settings change.
export async function browserTestRuntime(mods) {
  const supplied = process.env.NOVA7_CHROMIUM_BIN;
  const cached = "/tmp/nova7-chromium/chromium";
  const args = ["--no-sandbox", "--disable-dev-shm-usage"];
  if (supplied || fs.existsSync(cached)) {
    return {
      options: { executablePath: supplied || cached, args },
      close() {},
    };
  }
  if (!mods) throw Error("Set NOVA7_CHROMIUM_BIN or NOVA7_TEST_MODULES for browser tests.");
  const chromium = (await import(mods + "/@sparticuz/chromium/build/index.js")).default;
  const executablePath = await chromium.executablePath();
  const directory = fs.mkdtempSync(join(tmpdir(), "nova7-browser-runtime-"));
  const fonts = join(directory, "fonts");
  try {
    fs.mkdirSync(fonts);
    for (const [asset, target] of [["al2023.tar.br", directory], ["fonts.tar.br", fonts]]) {
      const archive = brotliDecompressSync(fs.readFileSync(join(mods, "@sparticuz/chromium/bin", asset)));
      execFileSync("tar", ["-xf", "-", "-C", target], { input: archive });
    }
    const config = join(fonts, "fonts.conf");
    fs.writeFileSync(config, fs.readFileSync(config, "utf8")
      .replace("<dir>/tmp/fonts</dir>", `<dir>${fonts}</dir>`)
      .replace("/tmp/fonts-cache/", join(directory, "font-cache") + "/"));
    return {
      options: {
        executablePath,
        args: [...args, "--single-process", "--no-zygote", "--in-process-gpu", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        env: {
          ...process.env,
          FONTCONFIG_PATH: fonts,
          LD_LIBRARY_PATH: join(directory, "lib") + (process.env.LD_LIBRARY_PATH ? ":" + process.env.LD_LIBRARY_PATH : ""),
        },
      },
      close() { fs.rmSync(directory, { recursive: true, force: true }); },
    };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
