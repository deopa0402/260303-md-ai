"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ChangeEvent } from "react";

type TooltipState = {
  visible: boolean;
  x: number;
  y: number;
};

type ImageAlign = "left" | "center" | "right";

type ImageAction = "insert" | "replace";

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
const IMAGE_SIZES = [25, 50, 75, 100];
const IMAGE_ALIGNS: ImageAlign[] = ["left", "center", "right"];

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
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imageActionRef = useRef<ImageAction>("insert");

  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
  });
  const [selectedText, setSelectedText] = useState("");
  const [isVisualizing, setIsVisualizing] = useState(false);
  const [imageTooltip, setImageTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
  });
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

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

  const createImageNode = useCallback((dataUrl: string) => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("contenteditable", "false");
    wrapper.dataset.editorImageId = `img-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    wrapper.dataset.imageAlign = "center";
    wrapper.dataset.imageWidth = "100";
    wrapper.style.marginTop = "12px";
    wrapper.style.marginBottom = "12px";
    wrapper.style.textAlign = "center";

    const image = document.createElement("img");
    image.src = dataUrl;
    image.alt = "에디터 이미지";
    image.style.width = "100%";
    image.style.maxWidth = "560px";
    image.style.borderRadius = "10px";
    image.style.border = "1px solid #e5e7eb";
    image.style.display = "inline-block";

    wrapper.appendChild(image);
    return wrapper;
  }, []);

  const updateImageTooltipByElement = useCallback((wrapper: HTMLDivElement) => {
    const editor = editorRef.current;
    if (!editor) return;
    const editorRect = editor.getBoundingClientRect();
    const nodeRect = wrapper.getBoundingClientRect();
    setImageTooltip({
      visible: true,
      x: nodeRect.left - editorRect.left + nodeRect.width / 2,
      y: nodeRect.top - editorRect.top,
    });
  }, []);

  const clearImageSelection = useCallback(() => {
    const editor = editorRef.current;
    if (editor) {
      const selected = editor.querySelector('[data-editor-image-selected="true"]');
      if (selected instanceof HTMLDivElement) {
        selected.dataset.editorImageSelected = "false";
        selected.style.outline = "none";
      }
    }
    setSelectedImageId(null);
    setImageTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  const getSelectedImageWrapper = useCallback(() => {
    if (!selectedImageId) return null;
    const editor = editorRef.current;
    if (!editor) return null;
    const node = editor.querySelector(`[data-editor-image-id="${selectedImageId}"]`);
    return node instanceof HTMLDivElement ? node : null;
  }, [selectedImageId]);

  const selectImageWrapper = useCallback((wrapper: HTMLDivElement) => {
    clearImageSelection();

    setTooltip((prev) => ({ ...prev, visible: false }));
    setSelectedText("");
    onSelectionTextChange?.("");
    selectedRangeRef.current = null;
    emitEditorState(null, "");

    wrapper.dataset.editorImageSelected = "true";
    wrapper.style.outline = "2px solid #3b82f6";
    wrapper.style.outlineOffset = "2px";

    setSelectedImageId(wrapper.dataset.editorImageId ?? null);
    updateImageTooltipByElement(wrapper);
  }, [clearImageSelection, emitEditorState, onSelectionTextChange, updateImageTooltipByElement]);

  const openImageFilePicker = useCallback((action: ImageAction) => {
    imageActionRef.current = action;
    imageInputRef.current?.click();
  }, []);

  const insertOrReplaceImage = useCallback((dataUrl: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    if (imageActionRef.current === "replace") {
      const target = getSelectedImageWrapper();
      if (!target) return;
      const image = target.querySelector("img");
      if (image instanceof HTMLImageElement) {
        image.src = dataUrl;
        updateImageTooltipByElement(target);
        bumpVersionAndEmit(selectedRangeRef.current, selectedText);
      }
      return;
    }

    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const canInsertAtSelection =
      Boolean(range) &&
      Boolean(range && isInsideEditor(editor, range.commonAncestorContainer));

    const imageNode = createImageNode(dataUrl);

    if (canInsertAtSelection && range) {
      const insertRange = range.cloneRange();
      insertRange.collapse(false);
      insertRange.insertNode(imageNode);
      const spacer = document.createElement("p");
      spacer.innerHTML = "<br>";
      imageNode.insertAdjacentElement("afterend", spacer);
    } else {
      editor.appendChild(imageNode);
      const spacer = document.createElement("p");
      spacer.innerHTML = "<br>";
      editor.appendChild(spacer);
    }

    selectImageWrapper(imageNode);
    bumpVersionAndEmit(null, "");
  }, [bumpVersionAndEmit, createImageNode, getSelectedImageWrapper, selectImageWrapper, selectedText, updateImageTooltipByElement]);

  const applyImageWidth = useCallback((size: number) => {
    const wrapper = getSelectedImageWrapper();
    if (!wrapper) return;
    const image = wrapper.querySelector("img");
    if (!(image instanceof HTMLImageElement)) return;

    wrapper.dataset.imageWidth = String(size);
    image.style.width = `${size}%`;
    updateImageTooltipByElement(wrapper);
    bumpVersionAndEmit(selectedRangeRef.current, selectedText);
  }, [bumpVersionAndEmit, getSelectedImageWrapper, selectedText, updateImageTooltipByElement]);

  const applyImageAlign = useCallback((align: ImageAlign) => {
    const wrapper = getSelectedImageWrapper();
    if (!wrapper) return;

    wrapper.dataset.imageAlign = align;
    wrapper.style.textAlign = align;
    updateImageTooltipByElement(wrapper);
    bumpVersionAndEmit(selectedRangeRef.current, selectedText);
  }, [bumpVersionAndEmit, getSelectedImageWrapper, selectedText, updateImageTooltipByElement]);

  const deleteSelectedImage = useCallback(() => {
    const wrapper = getSelectedImageWrapper();
    if (!wrapper) return;
    const next = wrapper.nextElementSibling;
    wrapper.remove();
    if (next instanceof HTMLParagraphElement && next.innerHTML === "<br>") {
      next.remove();
    }
    clearImageSelection();
    bumpVersionAndEmit(selectedRangeRef.current, selectedText);
  }, [bumpVersionAndEmit, clearImageSelection, getSelectedImageWrapper, selectedText]);

  const handleImageFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return;
      insertOrReplaceImage(result);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }, [insertOrReplaceImage]);

  const updateSelectionState = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();

    if (!editor || !selection || selection.rangeCount === 0) {
      setTooltip((prev) => ({ ...prev, visible: false }));
      setImageTooltip((prev) => ({ ...prev, visible: false }));
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

    clearImageSelection();

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
  }, [clearImageSelection, emitEditorState, onSelectionTextChange]);

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

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const editor = editorRef.current;
      const target = event.target;
      if (!editor || !(target instanceof HTMLElement)) return;
      if (!editor.contains(target)) return;

      const wrapper = target.closest("[data-editor-image-id]");
      if (wrapper instanceof HTMLDivElement) {
        selectImageWrapper(wrapper);
        return;
      }

      clearImageSelection();
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [clearImageSelection, selectImageWrapper]);

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

    const wrapper = createImageNode(`data:${mimeType};base64,${base64}`);
    range.insertNode(wrapper);

    const spacer = document.createElement("p");
    spacer.innerHTML = "<br>";
    wrapper.insertAdjacentElement("afterend", spacer);
    selectImageWrapper(wrapper);
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
      <header className="h-12 shrink-0 border-b border-gray-200 px-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-700">Text Canvas (MVP)</h2>
        <button
          type="button"
          onClick={() => openImageFilePicker("insert")}
          className="rounded border border-gray-200 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
        >
          이미지
        </button>
      </header>

      <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-gray-100/80">
        <div className="mx-auto w-full max-w-4xl rounded-xl border border-gray-200 bg-white shadow-sm p-6 md:p-8 relative min-h-[540px]">
          {tooltip.visible && !imageTooltip.visible && (
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

          {imageTooltip.visible && selectedImageId && (
            <div
              className="absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 shadow-lg flex items-center gap-1.5"
              style={{ left: imageTooltip.x, top: imageTooltip.y - 10 }}
            >
              {IMAGE_SIZES.map((size) => (
                <button
                  key={`img-size-${size}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyImageWidth(size)}
                  className="rounded border border-gray-200 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
                >
                  {size}%
                </button>
              ))}

              <div className="h-4 w-px bg-gray-200" />

              {IMAGE_ALIGNS.map((align) => (
                <button
                  key={`img-align-${align}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyImageAlign(align)}
                  className="rounded border border-gray-200 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
                >
                  {align === "left" ? "좌" : align === "center" ? "중" : "우"}
                </button>
              ))}

              <div className="h-4 w-px bg-gray-200" />

              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => openImageFilePicker("replace")}
                className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
              >
                교체
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={deleteSelectedImage}
                className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100"
              >
                삭제
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

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageFileChange}
            className="hidden"
          />
        </div>
      </div>
    </section>
  );
});
