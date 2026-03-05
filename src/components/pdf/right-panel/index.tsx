"use client";

import { RightPanelHeader } from "./RightPanelHeader";
import { ChatInput } from "./summary/ChatInput";
import { ChatTimeline } from "./summary/ChatTimeline";

interface ChatMessage {
  role: "user" | "ai";
  type: "text" | "tool" | "error";
  content: string;
  toolResult?: {
    tool: "replace_selected_text";
    status: "applied" | "failed";
    before: string;
    after: string;
    requestId: string;
    basedOnVersion: number | null;
    currentVersion: number;
  };
}

interface RightPanelProps {
  messages: ChatMessage[];
  isTyping: boolean;
  onSend: (message: string, selectedSnippet: string) => void;
  selectedSnippet?: string;
  fileName?: string;
}

export function RightPanel({
  messages,
  isTyping,
  onSend,
  selectedSnippet,
  fileName,
}: RightPanelProps) {
  return (
    <div className="flex flex-col h-full bg-white relative overflow-hidden">
      <RightPanelHeader fileName={fileName} />
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
        <ChatTimeline messages={messages} isTyping={isTyping} />
      </div>
      <ChatInput onSend={onSend} disabled={isTyping} selectedSnippet={selectedSnippet} />
    </div>
  );
}
