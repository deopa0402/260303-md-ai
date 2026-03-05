"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

type TooltipState = {
  visible: boolean;
  x: number;
  y: number;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
};

const COLORS = ["#111827", "#2563eb", "#dc2626", "#16a34a"];
const SIZES = [14, 18, 24, 32];

const isInsideEditor = (editor: HTMLDivElement, node: Node | null) => {
  if (!node) return false;
  return editor.contains(node.nodeType === Node.TEXT_NODE ? node.parentNode : node);
};

interface LeftPanelProps {
  onSelectionTextChange?: (text: string) => void;
  onEditorStateChange?: (state: EditorStateJson) => void;
}

export interface EditorStateJson {
  docId: string;
  version: number;
  plainText: string;
  selection: {
    text: string;
    start: number;
    end: number;
  } | null;
}

export interface LeftPanelHandle {
  replaceSelectedText: (selectedText: string, nextText: string) => boolean;
}

export const LeftPanel = forwardRef<LeftPanelHandle, LeftPanelProps>(function LeftPanel(
  { onSelectionTextChange, onEditorStateChange },
  ref
) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const selectedRangeRef = useRef<Range | null>(null);
  const docIdRef = useRef("left-doc-1");
  const versionRef = useRef(1);

  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
  });
  const [selectedText, setSelectedText] = useState("");
  const [isVisualizing, setIsVisualizing] = useState(false);

  const buildSelectionOffsets = useCallback((range: Range) => {
    const editor = editorRef.current;
    if (!editor) return null;

    const preRange = document.createRange();
    preRange.selectNodeContents(editor);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const length = range.toString().length;

    return {
      start,
      end: start + length,
    };
  }, []);

  const emitEditorState = useCallback((selectionOverride?: Range | null, selectionTextOverride?: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    const selectionRange = selectionOverride === undefined ? selectedRangeRef.current : selectionOverride;
    const selectionText = (selectionTextOverride ?? selectionRange?.toString() ?? "").trim();
    const offsets = selectionRange ? buildSelectionOffsets(selectionRange) : null;

    const state: EditorStateJson = {
      docId: docIdRef.current,
      version: versionRef.current,
      plainText: editor.innerText,
      selection:
        selectionRange && selectionText && offsets
          ? {
              text: selectionText,
              start: offsets.start,
              end: offsets.end,
            }
          : null,
    };

    onEditorStateChange?.(state);
  }, [buildSelectionOffsets, onEditorStateChange]);

  const bumpVersionAndEmit = useCallback((selectionOverride?: Range | null, selectionTextOverride?: string) => {
    versionRef.current += 1;
    emitEditorState(selectionOverride, selectionTextOverride);
  }, [emitEditorState]);

  const updateSelectionState = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();

    if (!editor || !selection || selection.rangeCount === 0) {
      setTooltip((prev) => ({ ...prev, visible: false }));
      emitEditorState(null, "");
      return;
    }

    if (selection.isCollapsed) {
      const anchorInside = isInsideEditor(editor, selection.anchorNode);
      setTooltip((prev) => ({ ...prev, visible: false }));

      if (anchorInside) {
        setSelectedText("");
        onSelectionTextChange?.("");
        selectedRangeRef.current = null;
        emitEditorState(null, "");
      }

      return;
    }

    const range = selection.getRangeAt(0);
    if (!isInsideEditor(editor, range.commonAncestorContainer)) {
      setTooltip((prev) => ({ ...prev, visible: false }));
      return;
    }

    const text = range.toString().trim();
    if (!text) {
      setTooltip((prev) => ({ ...prev, visible: false }));
      setSelectedText("");
      onSelectionTextChange?.("");
      selectedRangeRef.current = null;
      emitEditorState(null, "");
      return;
    }

    const editorRect = editor.getBoundingClientRect();
    const rangeRect = range.getBoundingClientRect();

    selectedRangeRef.current = range.cloneRange();
    setSelectedText(text);
    onSelectionTextChange?.(text);
    emitEditorState(selectedRangeRef.current, text);
    setTooltip({
      visible: true,
      x: rangeRect.left - editorRect.left + rangeRect.width / 2,
      y: rangeRect.top - editorRect.top,
    });
  }, [emitEditorState, onSelectionTextChange]);

  const replaceTextInRange = useCallback((range: Range, nextText: string) => {
    const selection = window.getSelection();
    range.deleteContents();

    const textNode = document.createTextNode(nextText);
    range.insertNode(textNode);

    const nextRange = document.createRange();
    nextRange.selectNode(textNode);
    selection?.removeAllRanges();
    selection?.addRange(nextRange);

    selectedRangeRef.current = nextRange.cloneRange();
    updateSelectionState();
    bumpVersionAndEmit(selectedRangeRef.current, nextRange.toString());
    return true;
  }, [bumpVersionAndEmit, updateSelectionState]);

  const findRangeByExactText = useCallback((text: string) => {
    const editor = editorRef.current;
    if (!editor || !text) return null;

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();

    while (current) {
      const node = current as Text;
      const source = node.data;
      const index = source.indexOf(text);

      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + text.length);
        return range;
      }

      current = walker.nextNode();
    }

    return null;
  }, []);

  const replaceSelectedText = useCallback((selectedText: string, nextText: string) => {
    const editor = editorRef.current;
    const sourceRange = selectedRangeRef.current;
    if (!editor) return false;

    const original = selectedText.trim();
    const replacement = nextText.trim();
    if (!original || !replacement) return false;

    if (sourceRange && isInsideEditor(editor, sourceRange.commonAncestorContainer)) {
      const current = sourceRange.toString().trim();
      if (current === original) {
        return replaceTextInRange(sourceRange.cloneRange(), replacement);
      }
    }

    const fallbackRange = findRangeByExactText(original);
    if (!fallbackRange) return false;

    return replaceTextInRange(fallbackRange, replacement);
  }, [findRangeByExactText, replaceTextInRange]);

  useImperativeHandle(
    ref,
    () => ({
      replaceSelectedText,
    }),
    [replaceSelectedText]
  );

  useEffect(() => {
    const handleSelectionChange = () => {
      updateSelectionState();
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [updateSelectionState]);

  useEffect(() => {
    emitEditorState(null, "");
  }, [emitEditorState]);

  const applyTextStyle = (style: { color?: string; fontSize?: string }) => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    const sourceRange = selectedRangeRef.current;

    if (!selection || !editor || !sourceRange) return;
    if (!isInsideEditor(editor, sourceRange.commonAncestorContainer)) return;

    const range = sourceRange.cloneRange();
    const fragment = range.extractContents();
    const span = document.createElement("span");

    if (style.color) span.style.color = style.color;
    if (style.fontSize) span.style.fontSize = style.fontSize;

    span.appendChild(fragment);
    range.insertNode(span);

    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    selectedRangeRef.current = nextRange.cloneRange();

    updateSelectionState();
    bumpVersionAndEmit(selectedRangeRef.current, nextRange.toString());
  };

  const insertImageBelowSelection = (base64: string, mimeType: string) => {
    const editor = editorRef.current;
    const sourceRange = selectedRangeRef.current;
    if (!editor || !sourceRange) return;

    const range = sourceRange.cloneRange();
    range.collapse(false);

    const wrapper = document.createElement("div");
    wrapper.style.marginTop = "12px";
    wrapper.style.marginBottom = "12px";
    wrapper.setAttribute("contenteditable", "false");

    const image = document.createElement("img");
    image.src = `data:${mimeType};base64,${base64}`;
    image.alt = "텍스트 시각화 이미지";
    image.style.width = "100%";
    image.style.maxWidth = "480px";
    image.style.borderRadius = "10px";
    image.style.border = "1px solid #e5e7eb";

    wrapper.appendChild(image);
    range.insertNode(wrapper);

    const spacer = document.createElement("p");
    spacer.innerHTML = "<br>";
    wrapper.insertAdjacentElement("afterend", spacer);
    bumpVersionAndEmit(selectedRangeRef.current, selectedText);
  };

  const handleVisualizeText = async () => {
    const text = selectedText.trim();
    if (!text || isVisualizing) return;

    const apiKey = localStorage.getItem("gemini_api_key")?.trim();
    if (!apiKey) {
      return;
    }

    setIsVisualizing(true);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `다음 텍스트를 시각적으로 설명하는 이미지를 생성하세요: ${text}`,
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`image generation failed (${response.status})`);
      }

      const result = (await response.json()) as GeminiResponse;
      const parts = result.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find((part) => part.inlineData?.data && part.inlineData?.mimeType?.startsWith("image/"));

      if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) {
        throw new Error("no image payload returned");
      }

      insertImageBelowSelection(imagePart.inlineData.data, imagePart.inlineData.mimeType);
    } catch {
    } finally {
      setIsVisualizing(false);
    }
  };

  return (
    <section className="h-full bg-white overflow-hidden flex flex-col">
      <header className="h-12 shrink-0 border-b border-gray-200 px-4 flex items-center">
        <h2 className="text-xs font-semibold text-gray-700">Text Canvas (MVP)</h2>
      </header>

      <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-gray-100/80">
        <div className="mx-auto w-full max-w-4xl rounded-xl border border-gray-200 bg-white shadow-sm p-6 md:p-8 relative min-h-[540px]">
          {tooltip.visible && (
            <div
              className="absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 shadow-lg flex items-center gap-1.5"
              style={{ left: tooltip.x, top: tooltip.y - 10 }}
            >
              {SIZES.map((size) => (
                <button
                  key={`size-${size}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyTextStyle({ fontSize: `${size}px` })}
                  className="rounded border border-gray-200 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
                >
                  {size}
                </button>
              ))}

              <div className="h-4 w-px bg-gray-200" />

              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyTextStyle({ color })}
                  className="h-5 w-5 rounded-full border border-gray-200"
                  style={{ backgroundColor: color }}
                  aria-label={`color-${color}`}
                />
              ))}

              <div className="h-4 w-px bg-gray-200" />

              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleVisualizeText}
                disabled={isVisualizing}
                className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {isVisualizing ? "생성 중" : "텍스트 시각화"}
              </button>
            </div>
          )}

          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onInput={() => bumpVersionAndEmit(selectedRangeRef.current, selectedText)}
            className="min-h-[460px] outline-none text-gray-900 text-[18px] leading-8 before:text-gray-400 empty:before:content-[attr(data-placeholder)]"
            data-placeholder="여기에 프레젠테이션 본문 텍스트를 입력하세요..."
          />
        </div>
      </div>
    </section>
  );
});
