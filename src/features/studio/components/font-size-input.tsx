// Adapted from canva-clone, Copyright 2025 Alimardon Davronov, Apache-2.0. See THIRD_PARTY_NOTICES.md.
import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { Input } from "@/features/studio/ui/input";
import { Button } from "@/features/studio/ui/button";

interface FontSizeInputProps {
  value: number;
  onChange: (value: number) => void;
}

export const FontSizeInput = ({ value, onChange }: FontSizeInputProps) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const increment = () => onChange(value + 1);
  const decrement = () => onChange(value - 1);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    if (e.target.value.trim()) {
      const n = Number(e.target.value);
      if (Number.isFinite(n) && n >= 1 && n <= 1000) onChange(n);
    }
  };

  return (
    <div className="flex items-center">
      <Button
        aria-label="Diminuir fonte"
        disabled={value <= 1}
        onClick={decrement}
        variant="outline"
        className="p-2 rounded-r-none border-r-0"
        size="icon"
      >
        <Minus className="size-4" />
      </Button>
      <Input
        onChange={handleChange}
        value={draft}
        aria-label="Tamanho da fonte"
        inputMode="numeric"
        onBlur={() => setDraft(String(value))}
        className="w-[50px] h-8 focus-visible:ring-offset-0 focus-visible:ring-0 rounded-none"
      />
      <Button
        aria-label="Aumentar fonte"
        disabled={value >= 1000}
        onClick={increment}
        variant="outline"
        className="p-2 rounded-l-none border-l-0"
        size="icon"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
};
