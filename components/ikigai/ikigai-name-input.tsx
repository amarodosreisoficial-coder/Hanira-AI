"use client";

import { useState, useCallback } from "react";

interface IkigaiNameInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function IkigaiNameInput({ value, onChange }: IkigaiNameInputProps) {
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const val = event.target.value;
      if (val.length > 100) {
        setError("O nome deve ter no máximo 100 caracteres.");
        return;
      }
      setError(null);
      onChange(val);
    },
    [onChange]
  );

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-card p-6 sm:p-8">
      <label className="block text-sm font-medium leading-7 text-foreground">
        Qual nome você deseja que apareça no seu relatório?
      </label>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">
        Opcional. Aparecerá na capa e discretamente nas páginas internas do PDF.
      </p>
      <input
        id="ikigai-display-name"
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Seu nome ou nome de apresentação"
        className="mt-3 block w-full rounded-2xl border border-white/10 bg-background p-3 text-sm leading-7 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      />
      {error && <p className="mt-2 text-xs leading-6 text-destructive">{error}</p>}
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        Este nome não é enviado à IA nem salvo em banco de dados. Será usado
        apenas na composição visual do seu PDF.
      </p>
    </div>
  );
}