export type OutlineItem = {
  depth: number
  line: number
  slug: string
  text: string
}

export type DocumentListItem = {
  currentVersion: number
  id: string
  slug: string
  summary: string
  title: string
  updatedAt: string
  versionsCount: number
}

export type DocumentVersionSummary = {
  createdAt: string
  summary: string
  title: string
  version: number
}

export type AnnotationRecord = {
  blockId: string
  color: string
  contextAfter: string
  contextBefore: string
  createdAt: string
  endCol: number | null
  endLine: number | null
  endOffset: number
  id: string
  note: string
  quote: string
  selectedText: string
  startCol: number | null
  startLine: number | null
  startOffset: number
  version: number
}

export type DocumentDetail = {
  annotations: AnnotationRecord[]
  content: string
  currentVersion: number
  id: string
  outline: OutlineItem[]
  selectedVersion: number
  slug: string
  summary: string
  title: string
  updatedAt: string
  versions: DocumentVersionSummary[]
}

export type CreateAnnotationPayload = {
  anchor: {
    blockId: string
    contextAfter: string
    contextBefore: string
    endCol: number | null
    endLine: number | null
    endOffset: number
    quote: string
    selectedText: string
    startCol: number | null
    startLine: number | null
    startOffset: number
  }
  color: string
  note: string
  version?: number
}

export type RemoteState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { message: string; status: 'error' }
  | { data: T; status: 'ready' }
