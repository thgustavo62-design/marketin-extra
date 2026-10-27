import { unzipSync } from "fflate";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { parseEan } from "../domain/catalog.ts";
import { parsePrice, detectPromoColumns } from "../domain/promo.ts";
import type { ImportLine, PriceSource } from "../domain/promotion-review.ts";
const normal = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
export function importColumns(headers: unknown[], source: PriceSource) {
  const h = headers.map(normal),
    old = detectPromoColumns(headers);
  const find = (r: RegExp) => {
    const i = h.findIndex((x) => r.test(x));
    return i < 0 ? null : i;
  };
  const prices = {
    approximate: find(/APROX|APRX/),
    promotion: find(/PROMO|OFERTA/),
    sale: find(/(?:PRECO|VALOR).*VENDA/),
  };
  return {
    ...old,
    price:
      prices[source] ??
      (source === "approximate" ? find(/^(VALOR|PRECO)$/) : null),
    prices,
    reference:
      find(/^(REF|REFERENCIA|REFERENCIAS)$/) ??
      (old.name !== null && h[old.name + 1] === "" ? old.name + 1 : null),
    stock: find(/^ESTOQUE$/),
    cost: find(/(?:ULT|ULTIMO).*(?:PRC|PRECO|CUSTO).*ENTRADA/),
  };
}
export function parseReviewSheets(
  sheets: { name: string; cells: unknown[][] }[],
  source: PriceSource = "approximate",
) {
  const rows: ImportLine[] = [],
    errors: { section: string; line: number; message: string }[] = [],
    seen = new Map<string, ImportLine>();
  for (const sheet of sheets) {
    let hi = -1,
      columns: ReturnType<typeof importColumns> | null = null;
    for (let i = 0; i < Math.min(20, sheet.cells.length); i++) {
      const c = importColumns(sheet.cells[i], source);
      if (c.ean !== null && c.price !== null && c.name !== null) {
        hi = i;
        columns = c;
        break;
      }
    }
    if (!columns) {
      errors.push({
        section: sheet.name,
        line: 0,
        message:
          "Aba sem código, descrição e campo de preço escolhido; não importada.",
      });
      continue;
    }
    const c = columns,
      headers = sheet.cells[hi].map((x) => String(x ?? "")),
      get = (r: unknown[], index: number | null) =>
        index === null ? null : (r[index] ?? null);
    let block = 0;
    for (let i = hi + 1; i < sheet.cells.length; i++) {
      const r = sheet.cells[i],
        line = i + 1;
      if (r.every((x) => x == null || String(x).trim() === "")) {
        block++;
        continue;
      }
      const rawEan = get(r, c.ean),
        name = String(get(r, c.name) ?? "")
          .trim()
          .replace(/\s+/g, " ");
      // Category titles inside sheets are structural, not broken product rows.
      if (
        !String(rawEan ?? "").trim() &&
        name &&
        r.filter((x) => x != null && String(x).trim() !== "").length === 1
      ) {
        block++;
        continue;
      }
      const ean = parseEan(rawEan),
        price = parsePrice(get(r, c.price));
      if (!ean || price === null || !name) {
        errors.push({
          section: sheet.name,
          line,
          message: !ean
            ? "Código de barras inválido."
            : price === null
              ? "Preço escolhido ausente ou inválido."
              : "Descrição ausente.",
        });
        continue;
      }
      if (seen.has(ean)) {
        const prior = seen.get(ean)!;
        errors.push({
          section: sheet.name,
          line,
          message: `EAN ${ean} repetido${prior.price !== price ? " com preço divergente" : ""}; primeira ocorrência preservada para conferência.`,
        });
        continue;
      }
      const original: ImportLine["original"] = {};
      headers.forEach((h, k) => {
        if (h) {
          const v = r[k];
          original[h] =
            typeof v === "number"
              ? v
              : v == null
                ? null
                : String(v).slice(0, 1000);
        }
      });
      const row: ImportLine = {
        id: createHash("sha256")
          .update(`${sheet.name}:${line}:${ean}`)
          .digest("hex")
          .slice(0, 24),
        line,
        block,
        section: sheet.name,
        ean,
        name: name.slice(0, 300),
        reference: String(get(r, c.reference) ?? "")
          .trim()
          .slice(0, 300),
        price,
        prices: {
          approximate: parsePrice(get(r, c.prices.approximate)),
          promotion: parsePrice(get(r, c.prices.promotion)),
          sale: parsePrice(get(r, c.prices.sale)),
        },
        stock: parsePrice(get(r, c.stock)),
        cost: parsePrice(get(r, c.cost)),
        original,
      };
      seen.set(ean, row);
      rows.push(row);
    }
  }
  return {
    rows,
    errors,
    sheets: sheets.map((s) => ({
      name: s.name,
      items: rows.filter((r) => r.section === s.name).length,
    })),
  };
}
export function parseReviewWorkbook(
  file: Buffer,
  source: PriceSource = "approximate",
) {
  if (file.length > 4_000_000) throw Error("Planilha acima de 4 MB.");
  const zip = file.subarray(0, 2).toString() === "PK",
    ole = file.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
  if (!zip && !ole) throw Error("Envie uma planilha XLSX ou XLS válida.");
  if (zip) {
    let expanded = 0;
    unzipSync(file, {
      filter: (entry) => {
        expanded += entry.originalSize;
        if (expanded > 40_000_000)
          throw Error(
            "Planilha compactada acima do limite de leitura (40 MB descompactada).",
          );
        return false;
      },
    });
  }
  const wb = XLSX.read(file, {
    type: "buffer",
    cellText: true,
    cellDates: false,
    sheetRows: 5001,
  });
  if (wb.SheetNames.length > 40)
    throw Error("Máximo de 40 abas por importação.");
  for (const name of wb.SheetNames) {
    const full = wb.Sheets[name]["!fullref"] ?? wb.Sheets[name]["!ref"];
    if (full && XLSX.utils.decode_range(full).e.r >= 5000)
      throw Error("Máximo de 5.000 linhas por aba. Divida a planilha.");
  }
  const result = parseReviewSheets(
    wb.SheetNames.map((name) => ({
      name,
      cells: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
        header: 1,
        raw: false,
        defval: null,
        blankrows: true,
      }),
    })),
    source,
  );
  if (!result.rows.length)
    throw Error(
      "Nenhum produto válido encontrado no campo de preço escolhido.",
    );
  if (result.rows.length > 2000)
    throw Error("Máximo de 2.000 produtos por importação.");
  return result;
}
