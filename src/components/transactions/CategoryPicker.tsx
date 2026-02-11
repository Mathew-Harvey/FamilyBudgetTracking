"use client";

import { useState, useEffect, useRef } from "react";
import type { CategoryItem } from "@/types";

interface CategoryPickerProps {
  categories: CategoryItem[];
  currentCategoryId: string | null;
  onSelect: (categoryId: string) => void;
}

export default function CategoryPicker({
  categories,
  currentCategoryId,
  onSelect,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = categories.find((c) => c.id === currentCategoryId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors hover:bg-surface-hover"
        style={{
          backgroundColor: current?.colour
            ? `${current.colour}20`
            : undefined,
          color: current?.colour || undefined,
        }}
      >
        {current?.icon && <span>{current.icon}</span>}
        {current?.name || "Uncategorised"}
        <span className="text-text-muted ml-1">&#9662;</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-56 bg-surface border border-surface-hover rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                onSelect(cat.id);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-surface-hover transition-colors ${
                cat.id === currentCategoryId
                  ? "bg-accent/10 text-accent-light"
                  : "text-foreground"
              }`}
            >
              <span>{cat.icon || "·"}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
