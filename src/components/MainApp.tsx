"use client";

import { useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { LeftPanel } from "./pdf/left-panel";
import { RightPanel } from "./pdf/right-panel";

export interface ChatMessage {
  role: "user" | "ai";
  content: string;
}

const EMPTY_MD_FILE = "";

export function MainApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = async (content: string) => {
    const text = content.trim();
    if (!text || isTyping) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    const history = [...messages, userMessage];
    setMessages(history);
    setIsTyping(true);

    try {
      const apiKey = localStorage.getItem("gemini_api_key")?.trim();
      if (!apiKey) {
        setMessages([...history, { role: "ai", content: "`gemini_api_key`가 없습니다. localStorage에 키를 설정해주세요." }]);
        return;
      }

      const promptHistory = history
        .map((message) => `[${message.role === "user" ? "사용자" : "AI"}] ${message.content}`)
        .join("\n\n");

      const payload = {
        systemInstruction: {
          parts: [{ text: "당신은 간결한 Markdown 협업 어시스턴트입니다. 한국어로 간단명료하게 답변하세요." }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `현재 편집 중인 Markdown 문서 내용:\n${EMPTY_MD_FILE || "(빈 파일)"}\n\n대화 내역:\n${promptHistory}\n\n최신 사용자 질문에 답변해주세요.`,
              },
            ],
          },
        ],
      };

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        throw new Error(`AI API error (${response.status})`);
      }

      const result = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const answer = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      setMessages([...history, { role: "ai", content: answer || "응답을 생성하지 못했습니다." }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
      setMessages([...history, { role: "ai", content: `오류: ${message}` }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 text-gray-900">
      <header className="h-14 shrink-0 border-b border-gray-200 bg-white px-4 flex items-center">
        <h1 className="text-sm font-semibold tracking-wide">md-ai</h1>
      </header>

      <main className="flex-1 p-2 md:p-3 overflow-hidden">
        <PanelGroup autoSaveId="md-ai-panel-layout" direction="horizontal" className="h-full w-full rounded-xl overflow-hidden border border-gray-200 bg-white">
          <Panel defaultSize={55} minSize={30}>
            <LeftPanel markdown={EMPTY_MD_FILE} />
          </Panel>

          <PanelResizeHandle className="w-2 bg-gray-100 hover:bg-gray-200 transition-colors" />

          <Panel defaultSize={45} minSize={25}>
            <RightPanel messages={messages} isTyping={isTyping} onSend={handleSend} />
          </Panel>
        </PanelGroup>
      </main>
    </div>
  );
}
