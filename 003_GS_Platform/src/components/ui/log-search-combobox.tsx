'use client';

import * as React from 'react';
import { Search, ChevronsUpDown, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type LogSearchComboboxProps = {
  items: { label: string; index: number }[];
  currentIndex: number;
  onSelect: (index: number) => void;
  placeholder?: string;
};

export function LogSearchCombobox({ items, currentIndex, onSelect, placeholder = 'Search entries...' }: LogSearchComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = search
    ? items.filter(item => item.label.toLowerCase().includes(search.toLowerCase()))
    : items;

  const currentLabel = items.find(item => item.index === currentIndex)?.label;

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) setSearch('');
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full max-w-sm justify-between font-normal"
        >
          <span className="truncate">
            {currentLabel ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
            className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No entries found.</div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.index}
                onClick={() => {
                  onSelect(item.index);
                  setOpen(false);
                  setSearch('');
                }}
                className={cn(
                  'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                  item.index === currentIndex && 'bg-accent text-accent-foreground'
                )}
              >
                <Check className={cn('mr-2 h-4 w-4 shrink-0', item.index === currentIndex ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate">{item.label}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
