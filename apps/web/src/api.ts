import type { CreateAnnotationPayload, DocumentDetail, DocumentListItem } from './types'

type DocumentsResponse = {
  items: DocumentListItem[]
}

async function request<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(payload?.message ?? `Request failed with status ${response.status}`)
  }

  return (await response.json()) as T
}

export const api = {
  async createAnnotation(documentId: string, payload: CreateAnnotationPayload) {
    return request(`/api/documents/${documentId}/annotations`, {
      body: JSON.stringify(payload),
      method: 'POST',
    })
  },
  async deleteAnnotation(annotationId: string) {
    await fetch(`/api/annotations/${annotationId}`, { method: 'DELETE' })
  },
  async getDocumentDetail(documentId: string, version?: number) {
    const url = new URL(`/api/documents/${documentId}/content`, window.location.origin)
    if (version !== undefined) {
      url.searchParams.set('version', String(version))
    }

    return request<DocumentDetail>(`${url.pathname}${url.search}`)
  },
  async listDocuments() {
    const response = await request<DocumentsResponse>('/api/documents')
    return response.items
  },
}
