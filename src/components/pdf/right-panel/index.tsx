"use client";

import { RightPanelHeader } from "./RightPanelHeader";
import { ChatInput } from "./summary/ChatInput";
import { ChatTimeline } from "./summary/ChatTimeline";

interface ChatMessage {
  role: "user" | "ai";
  content: string;
}

interface RightPanelProps {
  messages: ChatMessage[];
  isTyping: boolean;
  onSend: (message: string) => void;
  fileName?: string;
}

export function RightPanel({
  messages,
  isTyping,
  onSend,
  fileName,
}: RightPanelProps) {
  return (
    <div className="flex flex-col h-full bg-white relative overflow-hidden">
      <RightPanelHeader fileName={fileName} />
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
        <ChatTimeline messages={messages} isTyping={isTyping} />
      </div>
      <ChatInput onSend={onSend} disabled={isTyping} />
    </div>
  );
}
