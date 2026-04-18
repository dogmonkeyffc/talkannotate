import { z } from 'zod'

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

export const pushDocumentSchema = z.object({
  content: z.string().min(1),
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1),
})

export const createAnnotationSchema = z.object({
  anchor: z.object({
    blockId: z.string().trim().min(1),
    contextAfter: z.string().default(''),
    contextBefore: z.string().default(''),
    endCol: z.number().int().positive().nullable().default(null),
    endLine: z.number().int().positive().nullable().default(null),
    endOffset: z.number().int().nonnegative(),
    quote: z.string().trim().min(1),
    selectedText: z.string().trim().min(1),
    startCol: z.number().int().positive().nullable().default(null),
    startLine: z.number().int().positive().nullable().default(null),
    startOffset: z.number().int().nonnegative(),
  }),
  color: z.string().trim().min(1).default('violet'),
  note: z.string().trim().min(1),
  version: z.number().int().positive().optional(),
})

export type PushDocumentInput = z.infer<typeof pushDocumentSchema>
export type CreateAnnotationInput = z.infer<typeof createAnnotationSchema>
