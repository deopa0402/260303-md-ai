"use client";

import { MarkdownRenderer } from "../shared/MarkdownRenderer";

interface LeftPanelProps {
  markdown: string;
}

export function LeftPanel({ markdown }: LeftPanelProps) {
  return (
    <section className="h-full bg-white overflow-hidden flex flex-col">
      <header className="h-12 shrink-0 border-b border-gray-200 px-4 flex items-center">
        <h2 className="text-xs font-semibold text-gray-700">empty.md</h2>
      </header>

      <div className="flex-1 overflow-auto p-4 custom-scrollbar">
        <MarkdownRenderer content={markdown} />
      </div>
    </section>
  );
}
