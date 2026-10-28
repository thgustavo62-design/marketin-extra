"use client";
import { useEffect, useState } from "react";
import {
  designColor,
  designHex,
  parseDesignColor,
} from "@/lib/domain/design-colors";
import { colors } from "../types";
import "./design-styles.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  swatches?: string[];
};
// Explicit commit avoids serializing a whole page on every color-drag frame.
export function ColorPicker({
  value,
  onChange,
  label = "Cor",
  swatches = colors,
}: Props) {
  const initial = parseDesignColor(value) ?? { r: 0, g: 0, b: 0, a: 1 };
  const [draft, setDraft] = useState(designColor(initial));
  useEffect(() => {
    setDraft(
      designColor(parseDesignColor(value) ?? { r: 0, g: 0, b: 0, a: 1 }),
    );
  }, [value]);
  const parsed = parseDesignColor(draft),
    color = parsed ?? initial;
  const apply = (next: string) => {
    setDraft(next);
    onChange(next);
  };
  return (
    <div className="studio-color-picker" role="group" aria-label={label}>
      <div className="style-color-entry">
        <input
          type="color"
          aria-label={`${label} visual`}
          value={designHex(color)}
          onChange={(e) => {
            const rgb = parseDesignColor(e.target.value)!;
            setDraft(designColor({ ...rgb, a: color.a }));
          }}
        />
        <input
          type="text"
          aria-label={`${label} HEX ou RGBA`}
          value={draft}
          maxLength={60}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && parsed) {
              e.preventDefault();
              apply(designColor(parsed));
            }
          }}
          aria-invalid={!parsed}
        />
      </div>
      <label className="style-alpha">
        Transparência <output>{Math.round((1 - color.a) * 100)}%</output>
        <input
          type="range"
          aria-label={`${label} transparência`}
          min={0}
          max={100}
          value={Math.round((1 - color.a) * 100)}
          onChange={(e) =>
            setDraft(
              designColor({ ...color, a: 1 - Number(e.target.value) / 100 }),
            )
          }
        />
      </label>
      <button
        type="button"
        className="studio-choice"
        disabled={!parsed}
        onClick={() => parsed && apply(designColor(parsed))}
      >
        Aplicar cor
      </button>
      {!parsed && <p role="status">Use #RRGGBB, #RRGGBBAA ou rgba(r,g,b,a).</p>}
      <div className="style-swatches" aria-label="Cores rápidas">
        {swatches.map((c) => (
          <button
            type="button"
            key={c}
            title={c}
            aria-label={`Usar ${c}`}
            className="style-swatch"
            aria-pressed={draft === c}
            style={{ background: c }}
            onClick={() => apply(c)}
          />
        ))}
      </div>
    </div>
  );
}
