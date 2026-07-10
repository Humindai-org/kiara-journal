"use client";

import { cn } from "@/lib/cn";

const EMOTIONS: { name: string; emoji: string }[] = [
  { name: "Calm", emoji: "😌" },
  { name: "Confident", emoji: "💪" },
  { name: "Anxious", emoji: "😰" },
  { name: "FOMO", emoji: "😤" },
  { name: "Impatient", emoji: "⏰" },
  { name: "Bored", emoji: "😑" },
  { name: "Excited", emoji: "🔥" },
  { name: "Fearful", emoji: "😨" },
  { name: "Relieved", emoji: "😮‍💨" },
  { name: "Disappointed", emoji: "😞" },
  { name: "Satisfied", emoji: "✅" },
  { name: "Regretful", emoji: "😔" },
];

const ENTRY_SET = ["Calm","Confident","Anxious","FOMO","Impatient","Bored","Excited","Fearful"];
const EXIT_SET = ["Calm","Relieved","Excited","Anxious","Bored","Disappointed","Satisfied","Regretful"];

interface EmotionSelectorProps {
  label: string;
  selected: string | null;
  onChange: (emotion: string | null) => void;
  readonly?: boolean;
}

export default function EmotionSelector({ label, selected, onChange, readonly }: EmotionSelectorProps) {
  const set = label.toLowerCase().includes("exit") ? EXIT_SET : ENTRY_SET;
  const emotions = set.map(n => EMOTIONS.find(e => e.name === n)!).filter(Boolean);

  return (
    <div>
      <p className="text-[11px] text-text-muted uppercase tracking-wider mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {emotions.map(({ name, emoji }) => {
          const isSelected = selected === name;
          return (
            <button
              key={name}
              type="button"
              disabled={readonly}
              onClick={() => !readonly && onChange(isSelected ? null : name)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs border transition-colors",
                isSelected
                  ? "border-accent bg-accent-soft text-accent"
                  : "bg-surface-hi border-border text-text-secondary",
                !readonly && !isSelected && "hover:bg-surface-hover cursor-pointer",
                !readonly && isSelected && "cursor-pointer",
                readonly && "cursor-default"
              )}
            >
              <span className="text-sm leading-none">{emoji}</span>
              <span>{name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
