'use client';
/* oxlint-disable typescript/no-deprecated, jsx-a11y/prefer-tag-over-role, jsx-a11y/interactive-supports-focus */

import DOMPurify from 'dompurify';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'h1',
  'h2',
  'h3',
  'ol',
  'ul',
  'li',
  'div',
  'span',
];
const ALLOWED_ATTR = ['style'];

export function sanitizeHtml(html: string) {
  const cleaned = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
  const template = document.createElement('template');
  template.innerHTML = cleaned;
  template.content.querySelectorAll<HTMLElement>('[style]').forEach((node) => {
    const match = node
      .getAttribute('style')
      ?.match(/^\s*text-align\s*:\s*(left|center|right|justify)\s*;?\s*$/i);
    if (match)
      node.setAttribute('style', `text-align:${match[1].toLowerCase()}`);
    else node.removeAttribute('style');
  });
  return template.innerHTML;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  hint?: string;
};

export function RichTextEditor({ value, onChange, label, hint }: Props) {
  const editor = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const [states, setStates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (
      editor.current &&
      editor.current.innerHTML !== value &&
      !editor.current.contains(document.activeElement)
    ) {
      editor.current.innerHTML = sanitizeHtml(value);
    }
  }, [value]);

  const emit = () => {
    if (!composing.current && editor.current)
      onChange(sanitizeHtml(editor.current.innerHTML));
  };
  const refresh = () => {
    const keys = [
      'bold',
      'italic',
      'underline',
      'strikeThrough',
      'insertOrderedList',
      'insertUnorderedList',
      'justifyLeft',
      'justifyCenter',
      'justifyRight',
      'justifyFull',
    ];
    setStates(
      Object.fromEntries(
        keys.map((key) => [key, document.queryCommandState(key)]),
      ),
    );
  };
  const command = (name: string, argument?: string) => {
    editor.current?.focus();
    document.execCommand(name, false, argument);
    emit();
    refresh();
  };
  const buttons = [
    ['bold', '加粗', Bold],
    ['italic', '斜体', Italic],
    ['underline', '下划线', Underline],
    ['strikeThrough', '删除线', Strikethrough],
    ['justifyLeft', '左对齐', AlignLeft],
    ['justifyCenter', '居中', AlignCenter],
    ['justifyRight', '右对齐', AlignRight],
    ['justifyFull', '两端对齐', AlignJustify],
    ['insertOrderedList', '有序列表', ListOrdered],
    ['insertUnorderedList', '无序列表', List],
    ['undo', '撤销', Undo2],
    ['redo', '重做', Redo2],
  ] as const;

  return (
    <section className="editor-card">
      <div className="section-title">
        <div>
          <h2>{label}</h2>
          {hint && <p>{hint}</p>}
        </div>
        <span>草稿自动保存在本机</span>
      </div>
      <div
        className="editor-toolbar"
        role="toolbar"
        aria-label={`${label}格式工具栏`}
        onMouseDown={(event) => event.preventDefault()}
      >
        <select
          aria-label="标题级别"
          className="format-select"
          defaultValue="p"
          onChange={(event) => command('formatBlock', event.target.value)}
        >
          <option value="p">正文</option>
          <option value="h1">一级标题</option>
          <option value="h2">二级标题</option>
          <option value="h3">三级标题</option>
        </select>
        {buttons.map(([name, text, Icon], index) => (
          <button
            aria-label={text}
            aria-pressed={Boolean(states[name])}
            className={
              states[name] ? 'toolbar-button is-active' : 'toolbar-button'
            }
            key={name}
            onClick={() => command(name)}
            title={text}
            type="button"
          >
            <Icon />
            {index === 3 || index === 7 || index === 9 ? <i /> : null}
          </button>
        ))}
        <button
          className="clear-format"
          onClick={() => command('removeFormat')}
          type="button"
        >
          <Eraser />
          清除格式
        </button>
      </div>
      <div
        aria-label={label}
        className="editable"
        contentEditable
        ref={editor}
        role="textbox"
        suppressContentEditableWarning
        onCompositionEnd={() => {
          composing.current = false;
          emit();
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onInput={emit}
        onKeyUp={refresh}
        onMouseUp={refresh}
      />
    </section>
  );
}
