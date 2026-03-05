"use client";

import { useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { LeftPanel, type EditorStateJson, type LeftPanelHandle } from "./pdf/left-panel";
import { RightPanel } from "./pdf/right-panel";

export interface ChatMessage {
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

interface GeminiTextResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

interface AgentPlan {
  mode?: "tool" | "reply";
  tool?: "replace_selected_text" | null;
  replacementText?: string;
  message?: string;
  requestId?: string;
  basedOnVersion?: number;
}

interface AgentRequestJson {
  requestId: string;
  docId: string;
  version: number;
  selectionText: string;
  userInstruction: string;
}

const TOOL_CATALOG = [
  "- replace_selected_text: 현재 선택된 본문 텍스트를 수정 결과로 교체",
].join("\n");

const readGeminiText = (result: GeminiTextResponse) =>
  result.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? "";

const parseAgentPlan = (raw: string): AgentPlan | null => {
  const text = raw.trim();
  if (!text) return null;

  const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;

  try {
    return JSON.parse(candidate) as AgentPlan;
  } catch {
    return null;
  }
};

export function MainApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [editorState, setEditorState] = useState<EditorStateJson>({
    docId: "left-doc-1",
    version: 1,
    plainText: "",
    selection: null,
  });
  const leftPanelRef = useRef<LeftPanelHandle | null>(null);

  const handleSend = async (content: string, selectedSnapshot: string) => {
    const text = content.trim();
    if (!text || isTyping) return;

    const selectedAtRequest = selectedSnapshot.trim();
    const stateAtRequest = editorState;
    const requestId = `${Date.now()}`;

    const userMessage: ChatMessage = { role: "user", type: "text", content: text };
    const history = [...messages, userMessage];
    setMessages(history);
    setIsTyping(true);

    try {
      const apiKey = localStorage.getItem("gemini_api_key")?.trim();
      if (!apiKey) {
        setMessages([
          ...history,
          {
            role: "ai",
            type: "error",
            content: "`gemini_api_key`가 없습니다. localStorage에 키를 설정해주세요.",
          },
        ]);
        return;
      }

      const promptHistory = history
        .map((message) => `[${message.role === "user" ? "사용자" : "AI"}] ${message.content}`)
        .join("\n\n");

      const agentRequest: AgentRequestJson = {
        requestId,
        docId: stateAtRequest.docId,
        version: stateAtRequest.version,
        selectionText: selectedAtRequest,
        userInstruction: text,
      };

      const prompt = [
        "당신이 사용할 수 있는 도구 목록:",
        TOOL_CATALOG,
        "",
        "현재 편집기 상태(JSON):",
        JSON.stringify(stateAtRequest),
        "",
        "이전 대화 내역:",
        promptHistory,
        "",
        "이번 요청(JSON):",
        JSON.stringify(agentRequest),
        "",
        "다음 JSON 스키마로만 응답하세요:",
        '{"mode":"tool|reply","tool":"replace_selected_text|null","replacementText":"...","message":"...","requestId":"...","basedOnVersion":0}',
        "규칙:",
        "1) 선택 텍스트를 수정해야 하는 요청이면 mode=tool, tool=replace_selected_text 사용",
        "2) replacementText에는 최종 치환 텍스트만 넣기",
        "3) requestId/basedOnVersion은 이번 요청 JSON과 동일하게 채우기",
        "4) 도구 실행이 불가능하면 mode=reply, message에 이유 작성",
        "5) 설명 문장/마크다운/코드블록 없이 JSON만 반환",
      ].join("\n");

      const payload = {
        systemInstruction: {
          parts: [
            {
              text: "당신은 우측 패널의 한국어 본문 수정 에이전트다. 도구 사용 가능 여부를 판단하고 반드시 지정 JSON으로 응답한다.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt,
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

      const result = (await response.json()) as GeminiTextResponse;
      const rawAnswer = readGeminiText(result);
      const parsed = parseAgentPlan(rawAnswer);

      if (parsed?.mode === "tool" && parsed.tool === "replace_selected_text") {
        const replacement = parsed.replacementText?.trim() ?? "";
        const versionMatch = parsed.basedOnVersion === stateAtRequest.version;
        const requestMatch = parsed.requestId === requestId;
        const canApply = Boolean(selectedAtRequest) && Boolean(replacement) && versionMatch && requestMatch;
        const applied = canApply
          ? leftPanelRef.current?.replaceSelectedText(selectedAtRequest, replacement) ?? false
          : false;

        setMessages([
          ...history,
          {
            role: "ai",
            type: "tool",
            content: applied
              ? "선택 문장을 수정해 좌측 본문에 반영했어요."
              : "선택 문장 반영에 실패했어요. 문장을 다시 선택한 뒤 요청해 주세요.",
            toolResult: {
              tool: "replace_selected_text",
              status: applied ? "applied" : "failed",
              before: selectedAtRequest || "(선택 없음)",
              after: replacement || "(비어 있음)",
              requestId,
              basedOnVersion: parsed.basedOnVersion ?? null,
              currentVersion: stateAtRequest.version,
            },
          },
        ]);
        return;
      }

      const fallback = parsed?.message?.trim() || rawAnswer || "응답을 생성하지 못했습니다.";
      setMessages([...history, { role: "ai", type: "text", content: fallback }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
      setMessages([...history, { role: "ai", type: "error", content: `오류: ${message}` }]);
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
            <LeftPanel ref={leftPanelRef} onEditorStateChange={setEditorState} />
          </Panel>

          <PanelResizeHandle className="w-2 bg-gray-100 hover:bg-gray-200 transition-colors" />

          <Panel defaultSize={45} minSize={25}>
            <RightPanel
              messages={messages}
              isTyping={isTyping}
              onSend={handleSend}
              selectedSnippet={editorState.selection?.text ?? ""}
            />
          </Panel>
        </PanelGroup>
      </main>
    </div>
  );
}
