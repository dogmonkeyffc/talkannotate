import React from 'react'
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
} from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'

import type { AnnotationRecord, CreateAnnotationPayload } from '../types'
import { MermaidDiagram } from './MermaidDiagram'

type MarkdownPreviewProps = {
  annotations: AnnotationRecord[]
  busy: boolean
  content: string
  focusedBlockId: string | null
  onCreateAnnotation: (payload: CreateAnnotationPayload) => Promise<void>
  version: number
}

type SelectionDraft = {
  blockId: string
  contextAfter: string
  contextBefore: string
  endCol: number | null
  endLine: number | null
  endOffset: number
  quote: string
  rect: { left: number; top: number }
  selectedText: string
  startCol: number | null
  startLine: number | null
  startOffset: number
}

type MarkdownComponentProps = {
  children?: React.ReactNode
  className?: string
  node?: { position?: { start?: { offset?: number } } }
} & Record<string, unknown>
type MarkdownBlockTag = 'blockquote' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'li' | 'p' | 'pre'

export function MarkdownPreview({
  annotations,
  busy,
  content,
  focusedBlockId,
  onCreateAnnotation,
  version,
}: MarkdownPreviewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [draft, setDraft] = useState<SelectionDraft | null>(null)
  const [note, setNote] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  const annotationCountByBlock = useMemo(
    () =>
      annotations.reduce<Record<string, number>>((result, annotation) => {
        result[annotation.blockId] = (result[annotation.blockId] ?? 0) + 1
        return result
      }, {}),
    [annotations],
  )

  useEffect(() => {
    if (!focusedBlockId || !rootRef.current) {
      return
    }

    const target = rootRef.current.querySelector<HTMLElement>(`[data-block-id="${focusedBlockId}"]`)
    target?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [focusedBlockId])

  const components = useMemo(
    () =>
      ({
        blockquote: createBlockRenderer(
          'blockquote',
          annotationCountByBlock,
          focusedBlockId,
        ) as Components['blockquote'],
        code({ children, className }) {
          const language = className?.replace('language-', '')
          const value = String(children).replace(/\n$/, '')

          if (language === 'mermaid') {
            return <MermaidDiagram chart={value} />
          }

          return <code className={className}>{children}</code>
        },
        h1: createBlockRenderer('h1', annotationCountByBlock, focusedBlockId) as Components['h1'],
        h2: createBlockRenderer('h2', annotationCountByBlock, focusedBlockId) as Components['h2'],
        h3: createBlockRenderer('h3', annotationCountByBlock, focusedBlockId) as Components['h3'],
        h4: createBlockRenderer('h4', annotationCountByBlock, focusedBlockId) as Components['h4'],
        h5: createBlockRenderer('h5', annotationCountByBlock, focusedBlockId) as Components['h5'],
        h6: createBlockRenderer('h6', annotationCountByBlock, focusedBlockId) as Components['h6'],
        li: createBlockRenderer('li', annotationCountByBlock, focusedBlockId) as Components['li'],
        p: createBlockRenderer('p', annotationCountByBlock, focusedBlockId) as Components['p'],
        pre: createBlockRenderer(
          'pre',
          annotationCountByBlock,
          focusedBlockId,
        ) as Components['pre'],
      }) satisfies Components,
    [annotationCountByBlock, focusedBlockId],
  )

  const handleMouseUp = () => {
    const rootElement = rootRef.current
    if (!rootElement) {
      return
    }

    const result = buildSelectionDraft(rootElement, content)
    if (!result) {
      setDraft(null)
      return
    }
    setDraft(result)
  }

  const handleSubmit = async () => {
    if (!draft || !note.trim()) {
      return
    }

    await onCreateAnnotation({
      anchor: {
        blockId: draft.blockId,
        contextAfter: draft.contextAfter,
        contextBefore: draft.contextBefore,
        endCol: draft.endCol,
        endLine: draft.endLine,
        endOffset: draft.endOffset,
        quote: draft.quote,
        selectedText: draft.selectedText,
        startCol: draft.startCol,
        startLine: draft.startLine,
        startOffset: draft.startOffset,
      },
      color: 'violet',
      note: note.trim(),
      version,
    })

    setDraft(null)
    setModalOpen(false)
    setNote('')
    window.getSelection()?.removeAllRanges()
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="markdown-preview" onMouseUp={handleMouseUp} ref={rootRef}>
        <ReactMarkdown
          components={components}
          rehypePlugins={[rehypeSlug]}
          remarkPlugins={[remarkGfm]}
        >
          {content}
        </ReactMarkdown>
      </div>

      {draft ? (
        <Paper
          className="selection-popover"
          p="sm"
          radius="lg"
          shadow="lg"
          style={{
            left: draft.rect.left,
            top: draft.rect.top,
          }}
          withBorder
        >
          <Group gap="sm" wrap="nowrap">
            <Text c="dimmed" lineClamp={1} size="xs" style={{ flex: 1, minWidth: 0 }}>
              {draft.selectedText}
            </Text>
            <Button
              color="violet"
              onClick={() => setModalOpen(true)}
              size="compact-sm"
              variant="filled"
            >
              批注
            </Button>
            <Button
              color="gray"
              onClick={() => {
                setDraft(null)
                window.getSelection()?.removeAllRanges()
              }}
              size="compact-sm"
              variant="subtle"
            >
              取消
            </Button>
          </Group>
        </Paper>
      ) : null}

      <Modal
        centered
        onClose={() => setModalOpen(false)}
        opened={modalOpen}
        radius="xl"
        title="添加批注"
      >
        <Stack gap="md">
          <div>
            <Text c="dimmed" mb={8} size="sm">
              选中的文本
            </Text>
            <Paper p="sm" radius="md" withBorder>
              <Text size="sm">{draft?.selectedText}</Text>
            </Paper>
          </div>

          <Textarea
            autosize
            label="批注内容"
            minRows={4}
            onChange={(event) => setNote(event.currentTarget.value)}
            placeholder="写下你的批注..."
            value={note}
          />

          <Group justify="flex-end">
            <Button onClick={() => setModalOpen(false)} variant="subtle">
              取消
            </Button>
            <Button color="violet" loading={busy} onClick={() => void handleSubmit()}>
              保存
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  )
}

export function AnnotationCard({
  annotation,
  onDelete,
  onFocus,
}: {
  annotation: AnnotationRecord
  onDelete?: (id: string) => void
  onFocus: (blockId: string) => void
}) {
  return (
    <Paper
      className="annotation-card"
      onClick={() => onFocus(annotation.blockId)}
      p="sm"
      radius="md"
      withBorder
    >
      <Group justify="space-between" mb={8}>
        <Badge color={annotation.color} variant="light">
          v{annotation.version}
        </Badge>
        <Group gap={4}>
          <Text c="dimmed" size="xs">
            {formatTimestamp(annotation.createdAt)}
          </Text>
          {onDelete ? (
            <ActionIcon
              color="red"
              onClick={(event: React.MouseEvent) => {
                event.stopPropagation()
                onDelete(annotation.id)
              }}
              size="sm"
              variant="subtle"
            >
              <IconTrash size={14} />
            </ActionIcon>
          ) : null}
        </Group>
      </Group>
      <Text fw={600} size="sm">
        {annotation.note}
      </Text>
      <div className="annotation-quote">{annotation.quote}</div>
    </Paper>
  )
}

function formatTimestamp(value: string) {
  return value.replace('T', ' ').slice(0, 16)
}

function buildSelectionDraft(
  rootElement: HTMLElement,
  markdownSource: string,
): SelectionDraft | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (!rootElement.contains(range.commonAncestorContainer)) {
    return null
  }

  const startBlock = getBlockElement(range.startContainer)
  const endBlock = getBlockElement(range.endContainer)
  const singleBlockSelection = startBlock && endBlock && startBlock === endBlock

  const selectedText = selection.toString().trim()
  if (!selectedText) {
    return null
  }

  const anchorRoot = singleBlockSelection ? startBlock : rootElement
  const startOffset = getTextOffset(anchorRoot, range.startContainer, range.startOffset)
  const endOffset = getTextOffset(anchorRoot, range.endContainer, range.endOffset)
  const fullText = anchorRoot.textContent ?? ''

  const rangeRect = range.getBoundingClientRect()
  const rootRect = rootElement.getBoundingClientRect()

  const contextBefore = fullText.slice(Math.max(0, startOffset - 48), startOffset)
  const contextAfter = fullText.slice(endOffset, endOffset + 48)

  const startPos = findInMarkdown(markdownSource, selectedText, contextBefore)
  const endPos = startPos
    ? offsetToLineCol(
        markdownSource,
        markdownSource.indexOf(selectedText, lineColToOffset(markdownSource, startPos)) +
          selectedText.length -
          1,
      )
    : null

  return {
    blockId: singleBlockSelection
      ? (startBlock.dataset.blockId ?? 'unknown-block')
      : 'document-root',
    contextAfter,
    contextBefore,
    endCol: endPos?.col ?? null,
    endLine: endPos?.line ?? null,
    endOffset,
    quote: selectedText,
    rect: {
      left: rangeRect.left - rootRect.left,
      top: rangeRect.bottom - rootRect.top + 8,
    },
    selectedText,
    startCol: startPos?.col ?? null,
    startLine: startPos?.line ?? null,
    startOffset,
  }
}

function createBlockId(
  tag: MarkdownBlockTag,
  node: { position?: { start?: { offset?: number } } } | undefined,
) {
  const offset = node?.position?.start?.offset
  return `${tag}-${offset ?? 'root'}`
}

function createBlockRenderer<Tag extends MarkdownBlockTag>(
  tag: Tag,
  annotationCountByBlock: Record<string, number>,
  focusedBlockId: string | null,
): (props: MarkdownComponentProps) => React.ReactElement {
  const Block = ({ children, className, node, ...props }: MarkdownComponentProps) => {
    const blockId = createBlockId(tag, node)
    const count = annotationCountByBlock[blockId]

    return React.createElement(
      tag as keyof React.JSX.IntrinsicElements,
      {
        ...props,
        className,
        'data-annotation-count': count ? String(count) : undefined,
        'data-block-id': blockId,
        'data-focused': focusedBlockId === blockId ? 'true' : undefined,
      },
      children,
    )
  }

  return Block
}

function getBlockElement(node: Node) {
  const element = node instanceof HTMLElement ? node : node.parentElement
  return element?.closest<HTMLElement>('[data-block-id]')
}

function getTextOffset(rootElement: HTMLElement, container: Node, offset: number) {
  const range = document.createRange()
  range.selectNodeContents(rootElement)
  range.setEnd(container, offset)
  return range.toString().length
}

/**
 * Find the best occurrence of `quote` in `markdownSource`, using `contextBefore`
 * to disambiguate when multiple matches exist. Returns 1-based line/col.
 */
function findInMarkdown(
  markdownSource: string,
  quote: string,
  contextBefore: string,
): { col: number; line: number } | null {
  const occurrences: number[] = []
  let idx = markdownSource.indexOf(quote)
  while (idx !== -1) {
    occurrences.push(idx)
    idx = markdownSource.indexOf(quote, idx + 1)
  }

  if (occurrences.length === 0) return null

  let bestIdx = occurrences[0]!
  if (occurrences.length > 1 && contextBefore) {
    let bestScore = -1
    for (const pos of occurrences) {
      const preceding = markdownSource.slice(Math.max(0, pos - contextBefore.length), pos)
      let score = 0
      for (let i = 1; i <= Math.min(preceding.length, contextBefore.length); i++) {
        if (preceding[preceding.length - i] === contextBefore[contextBefore.length - i]) {
          score++
        } else {
          break
        }
      }
      if (score > bestScore) {
        bestScore = score
        bestIdx = pos
      }
    }
  }

  return offsetToLineCol(markdownSource, bestIdx)
}

function offsetToLineCol(source: string, offset: number): { col: number; line: number } {
  const before = source.slice(0, offset)
  const lines = before.split('\n')
  return {
    col: (lines[lines.length - 1]?.length ?? 0) + 1,
    line: lines.length,
  }
}

function lineColToOffset(source: string, pos: { col: number; line: number }): number {
  const lines = source.split('\n')
  let offset = 0
  for (let i = 0; i < pos.line - 1 && i < lines.length; i++) {
    offset += (lines[i]?.length ?? 0) + 1 // +1 for '\n'
  }
  return offset + pos.col - 1
}
