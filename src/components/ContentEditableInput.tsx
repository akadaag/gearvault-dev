/**
 * ContentEditableInput
 *
 * A `contenteditable` div that behaves like a controlled <input> or <textarea>.
 * iOS/Android do NOT show the keyboard form-navigation toolbar (up/down arrows
 * + Done) for contenteditable elements, unlike native <input>/<textarea>.
 *
 * Props mirror the subset of <textarea> / <input> props used in this project.
 */
import {
  useRef,
  useEffect,
  useLayoutEffect,
  forwardRef,
  useImperativeHandle,
  type KeyboardEvent,
  type ClipboardEvent,
} from 'react';

export type ContentEditableInputHandle = {
  focus(): void;
  blur(): void;
  clear(): void;
};

type Props = {
  /** Controlled value */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Single-line: blocks Enter key. Multi-line: allows Shift+Enter */
  multiline?: boolean;
  disabled?: boolean;
  className?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** aria-label for accessibility */
  'aria-label'?: string;
};

/**
 * Extract plain text from a contenteditable node, normalising line endings.
 */
function getPlainText(el: HTMLElement): string {
  // Walk child nodes so we get proper newlines from <br> / block elements.
  let text = '';
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? '';
    } else if (node.nodeName === 'BR') {
      text += '\n';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      text += getPlainText(node as HTMLElement);
      // Block-level elements add a newline after themselves
      const display = window.getComputedStyle(node as HTMLElement).display;
      if (display === 'block' || display === 'list-item') {
        text += '\n';
      }
    }
  });
  return text;
}

/**
 * Save / restore cursor position as a character offset so we can safely
 * re-sync the DOM when `value` changes externally (e.g. cleared after submit).
 */
function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

function setCaretOffset(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node: Text | null = null;
  let pos = 0;
  while (walker.nextNode()) {
    const n = walker.currentNode as Text;
    if (remaining <= n.length) {
      node = n;
      pos = remaining;
      break;
    }
    remaining -= n.length;
  }
  if (!node) {
    // Place caret at end
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }
  const range = document.createRange();
  range.setStart(node, pos);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

export const ContentEditableInput = forwardRef<ContentEditableInputHandle, Props>(
  function ContentEditableInput(
    {
      value,
      onChange,
      placeholder,
      multiline = false,
      disabled = false,
      className,
      onKeyDown,
      onFocus,
      onBlur,
      'aria-label': ariaLabel,
    },
    ref,
  ) {
    const divRef = useRef<HTMLDivElement>(null);
    // Track whether the last text change came from user input (vs. external value prop)
    const isComposingRef = useRef(false);
    const isFocusedRef = useRef(false);

    // Expose handle to parent (e.g. FloatingNavBar needs to call .focus() / .clear())
    useImperativeHandle(ref, () => ({
      focus() {
        divRef.current?.focus();
      },
      blur() {
        divRef.current?.blur();
      },
      clear() {
        if (divRef.current) {
          divRef.current.textContent = '';
        }
        onChange('');
      },
    }));

    /**
     * Sync the DOM when `value` changes externally (e.g. form cleared after submit,
     * or programmatic reset). We skip if the element is currently focused to avoid
     * caret-jump during normal typing.
     */
    useLayoutEffect(() => {
      const el = divRef.current;
      if (!el) return;

      // If element is focused, the user is typing — don't overwrite
      if (isFocusedRef.current) return;

      const current = getPlainText(el);
      if (current !== value) {
        // Preserve caret
        const offset = isFocusedRef.current ? getCaretOffset(el) : 0;
        el.textContent = value;
        if (isFocusedRef.current) setCaretOffset(el, offset);
      }
    }, [value]);

    /**
     * Also sync when value is cleared to empty string (e.g. after submit)
     * even while technically still focused (submit blurs immediately).
     */
    useEffect(() => {
      const el = divRef.current;
      if (!el) return;
      if (value === '' && getPlainText(el) !== '') {
        el.textContent = '';
      }
    }, [value]);

    function handleInput() {
      if (isComposingRef.current) return; // wait for compositionend
      const el = divRef.current;
      if (!el) return;
      const text = getPlainText(el);
      onChange(text);
    }

    function handleCompositionStart() {
      isComposingRef.current = true;
    }

    function handleCompositionEnd() {
      isComposingRef.current = false;
      handleInput();
    }

    function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
      e.preventDefault();
      const plain = e.clipboardData.getData('text/plain');
      if (!plain) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      sel.deleteFromDocument();
      const range = sel.getRangeAt(0);

      if (multiline) {
        // Insert text preserving newlines as <br>
        const lines = plain.split('\n');
        const frag = document.createDocumentFragment();
        lines.forEach((line, i) => {
          if (i > 0) frag.appendChild(document.createElement('br'));
          if (line) frag.appendChild(document.createTextNode(line));
        });
        range.insertNode(frag);
      } else {
        // Single line: strip all newlines
        const sanitised = plain.replace(/[\r\n]+/g, ' ');
        range.insertNode(document.createTextNode(sanitised));
      }

      // Move caret to end of inserted content
      sel.collapseToEnd();
      handleInput();
    }

    function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
      if (e.key === 'Enter' && !multiline) {
        e.preventDefault(); // single-line: block newlines
      }
      if (e.key === 'Enter' && multiline && !e.shiftKey) {
        // Let parent intercept (e.g. submit on Enter without Shift)
      }
      onKeyDown?.(e);
    }

    function handleFocus() {
      isFocusedRef.current = true;
      onFocus?.();
    }

    function handleBlur() {
      isFocusedRef.current = false;
      onBlur?.();
    }

    return (
      <div
        ref={divRef}
        contentEditable={disabled ? false : true}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline={multiline}
        aria-label={ariaLabel}
        aria-placeholder={placeholder}
        data-placeholder={placeholder}
        className={className}
        onInput={handleInput}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
      />
    );
  },
);
