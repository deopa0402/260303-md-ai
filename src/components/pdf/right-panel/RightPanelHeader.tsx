interface RightPanelHeaderProps {
  fileName?: string;
}

export function RightPanelHeader({ fileName }: RightPanelHeaderProps) {
  if (!fileName) return null;

  return (
    <header className="shrink-0 px-4 py-3 border-b border-gray-200/60 bg-gray-50/50 sticky top-0 z-10 flex items-center gap-2">
      <h2 className="text-sm font-semibold text-gray-800 truncate flex-1">{fileName}</h2>
    </header>
  );
}
