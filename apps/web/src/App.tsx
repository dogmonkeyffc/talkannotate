import {
  ActionIcon,
  Badge,
  Button,
  Box,
  Group,
  Loader,
  MantineProvider,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Text,
  createTheme,
} from '@mantine/core'
import {
  IconClipboard,
  IconClipboardCheck,
  IconDownload,
  IconMoonStars,
  IconRefresh,
  IconSparkles,
  IconSun,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useClipboard } from '@mantine/hooks'
import { match } from 'ts-pattern'

import { api } from './api'
import './App.css'
import { AnnotationCard, MarkdownPreview } from './components/MarkdownPreview'
import type {
  CreateAnnotationPayload,
  DocumentDetail,
  DocumentListItem,
  RemoteState,
} from './types'

const theme = createTheme({
  colors: {
    night: [
      '#f8fafc',
      '#e2e8f0',
      '#cbd5e1',
      '#94a3b8',
      '#64748b',
      '#475569',
      '#334155',
      '#1e293b',
      '#0f172a',
      '#020617',
    ],
  },
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  primaryColor: 'green',
})

function App() {
  const [documentsState, setDocumentsState] = useState<RemoteState<DocumentListItem[]>>({
    status: 'loading',
  })
  const [detailState, setDetailState] = useState<RemoteState<DocumentDetail>>({
    status: 'idle',
  })
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [savingAnnotation, setSavingAnnotation] = useState(false)
  const [documentPendingDeletion, setDocumentPendingDeletion] = useState<DocumentListItem | null>(null)
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null)
  const [colorScheme, setColorScheme] = useState<'dark' | 'light'>(() => {
    try {
      const stored = localStorage.getItem('talkannotate-color-scheme')
      if (stored === 'dark' || stored === 'light') return stored
    } catch {
      // ignore storage errors
    }
    return 'light'
  })
  const selectedDocumentIdRef = useRef<string | null>(null)

  useEffect(() => {
    selectedDocumentIdRef.current = selectedDocumentId
  }, [selectedDocumentId])

  const fetchDocuments = useCallback(async () => {
    try {
      const items = await api.listDocuments()
      const nextDocumentId = chooseDocumentId(items, selectedDocumentIdRef.current)
      setDocumentsState({ data: items, status: 'ready' })
      setDetailState(nextDocumentId ? { status: 'loading' } : { status: 'idle' })
      setSelectedDocumentId(nextDocumentId)
    } catch (error) {
      setDocumentsState({
        message: toMessage(error),
        status: 'error',
      })
    }
  }, [])

  const refreshDocuments = useCallback(() => {
    setDocumentsState({ status: 'loading' })
    setRefreshToken((value) => value + 1)
    void fetchDocuments()
  }, [fetchDocuments])

  useEffect(() => {
    queueMicrotask(() => {
      void fetchDocuments()
    })
  }, [fetchDocuments])

  useEffect(() => {
    if (!selectedDocumentId) {
      return
    }

    let cancelled = false

    void api
      .getDocumentDetail(selectedDocumentId, selectedVersion ?? undefined)
      .then((data) => {
        if (!cancelled) {
          setDetailState({ data, status: 'ready' })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDetailState({
            message: toMessage(error),
            status: 'error',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [refreshToken, selectedDocumentId, selectedVersion])

  const versionOptions = useMemo(
    () =>
      detailState.status === 'ready'
        ? detailState.data.versions.map((item) => ({
            label: `v${item.version} · ${formatTimestamp(item.createdAt)}`,
            value: String(item.version),
          }))
        : [],
    [detailState],
  )

  const refreshCurrentDocument = useCallback(() => {
    setDetailState({ status: 'loading' })
    setRefreshToken((value) => value + 1)
  }, [])

  const handleCreateAnnotation = useCallback(
    async (payload: CreateAnnotationPayload) => {
      if (!selectedDocumentId) {
        return
      }

      setSavingAnnotation(true)
      try {
        await api.createAnnotation(selectedDocumentId, payload)
        // Silent refresh: keep detailState as 'ready' so MarkdownPreview stays mounted
        // and scroll position is preserved.
        const data = await api.getDocumentDetail(selectedDocumentId, selectedVersion ?? undefined)
        setDetailState({ data, status: 'ready' })
      } finally {
        setSavingAnnotation(false)
      }
    },
    [selectedDocumentId, selectedVersion],
  )

  const clipboard = useClipboard({ timeout: 2000 })

  const handleCopyPrompt = useCallback(() => {
    if (detailState.status !== 'ready') return
    const { data } = detailState
    const prompt = [
      `Document: ${data.title}`,
      `ID: ${data.id}`,
      `Slug: ${data.slug}`,
      `Version: v${data.selectedVersion} (latest: v${data.currentVersion})`,
      `Annotations: ${data.annotations.length}`,
      '',
      'Please review the annotations on this document and address each one.',
    ].join('\n')
    clipboard.copy(prompt)
  }, [clipboard, detailState])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [restoring, setRestoring] = useState(false)

  const handleExport = useCallback(() => {
    const link = document.createElement('a')
    link.href = '/api/backup'
    link.click()
  }, [])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setRestoring(true)
      try {
        await fetch('/api/restore', {
          body: file,
          headers: { 'Content-Type': 'application/octet-stream' },
          method: 'POST',
        })
        refreshDocuments()
      } finally {
        setRestoring(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [refreshDocuments],
  )

  const toggleColorScheme = useCallback(() => {
    setColorScheme((value) => {
      const next = value === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem('talkannotate-color-scheme', next)
      } catch {
        // ignore storage errors
      }
      return next
    })
  }, [])

  const handleDeleteAnnotation = useCallback(
    async (annotationId: string) => {
      await api.deleteAnnotation(annotationId)
      refreshCurrentDocument()
    },
    [refreshCurrentDocument],
  )

  const handleConfirmDeleteDocument = useCallback(async () => {
    if (!documentPendingDeletion) {
      return
    }

    setDeletingDocumentId(documentPendingDeletion.id)
    try {
      await api.deleteDocument(documentPendingDeletion.id)
      setDocumentPendingDeletion(null)
      refreshDocuments()
    } finally {
      setDeletingDocumentId(null)
    }
  }, [documentPendingDeletion, refreshDocuments])

  return (
    <MantineProvider defaultColorScheme="light" forceColorScheme={colorScheme} theme={theme}>
      <div className="app-shell">
        <header className="statusbar">
          <Group gap="xs">
            <IconSparkles color="#a78bfa" size={16} />
            <Text fw={700} size="sm">
              TalkAnnotate
            </Text>
            <Text c="dimmed" size="xs">
              v0.1.0
            </Text>
          </Group>
          <div style={{ flex: 1 }} />
          <input
            accept=".tar.gz,.tgz"
            onChange={(e) => void handleImportFile(e)}
            ref={fileInputRef}
            style={{ display: 'none' }}
            type="file"
          />
          <Group gap="sm">
            <ActionIcon
              aria-label="导出数据备份"
              color="green"
              onClick={handleExport}
              size="lg"
              title="导出数据卷备份"
              variant="subtle"
            >
              <IconDownload size={20} />
            </ActionIcon>
            <ActionIcon
              aria-label="导入数据备份"
              color="green"
              loading={restoring}
              onClick={handleImportClick}
              size="lg"
              title="导入数据卷备份"
              variant="subtle"
            >
              <IconUpload size={20} />
            </ActionIcon>
            <ActionIcon
              aria-label={colorScheme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
              color="green"
              onClick={toggleColorScheme}
              size="lg"
              variant="subtle"
            >
              {colorScheme === 'dark' ? <IconSun size={20} /> : <IconMoonStars size={20} />}
            </ActionIcon>
          </Group>
        </header>

        <div className="workspace">
          <aside className="sidebar">
            <ScrollArea className="sidebar-scroll" type="auto">
              <div className="sidebar-section">
                <Group justify="space-between" mb="md">
                  <Text fw={600}>Documents</Text>
                  <Group gap="xs">
                    {documentsState.status === 'ready' ? (
                      <Badge variant="light">{documentsState.data.length}</Badge>
                    ) : null}
                    <ActionIcon
                      aria-label="Refresh documents"
                      color="green"
                      onClick={refreshDocuments}
                      size="sm"
                      variant="subtle"
                    >
                      <IconRefresh size={14} />
                    </ActionIcon>
                  </Group>
                </Group>

                {match(documentsState)
                  .with({ status: 'loading' }, () => (
                    <Group justify="center" py="xl">
                      <Loader color="green" size="sm" />
                    </Group>
                  ))
                  .with({ status: 'error' }, (state) => (
                    <Text c="red.3" size="sm">
                      {state.message}
                    </Text>
                  ))
                  .with({ status: 'ready' }, (state) => (
                    <div className="document-list">
                      {state.data.map((document) => (
                        <Box
                          className={[
                            'document-card',
                            document.id === selectedDocumentId ? 'document-card--active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          key={document.id}
                          onClick={() => {
                            setDetailState({ status: 'loading' })
                            setSelectedDocumentId(document.id)
                            setSelectedVersion(null)
                            setFocusedBlockId(null)
                          }}
                        >
                          <div className="document-card__meta">
                            <Text fw={700} lineClamp={1}>
                              {document.title}
                            </Text>
                            <Group gap={8} wrap="nowrap">
                              <Badge color="green" variant="light">
                                v{document.currentVersion}
                              </Badge>
                              <ActionIcon
                                aria-label={`删除文档 ${document.title}`}
                                color="red"
                                loading={deletingDocumentId === document.id}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setDocumentPendingDeletion(document)
                                }}
                                size="sm"
                                variant="subtle"
                              >
                                <IconTrash size={14} />
                              </ActionIcon>
                            </Group>
                          </div>
                          <Text c="dimmed" lineClamp={3} size="sm">
                            {document.summary}
                          </Text>
                          <Group gap={8} mt="md">
                            <Badge color="gray" variant="dot">
                              {document.versionsCount} versions
                            </Badge>
                            <Badge color="gray" variant="dot">
                              {formatTimestamp(document.updatedAt)}
                            </Badge>
                          </Group>
                        </Box>
                      ))}
                    </div>
                  ))
                  .otherwise(() => null)}
              </div>
            </ScrollArea>
          </aside>

          <main className="main-panel">
            {match(detailState)
              .with({ status: 'ready' }, (state) => (
                <>
                  <header className="main-header">
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap={10} wrap="wrap">
                        <Badge color="green" variant="light">
                          {state.data.annotations.length} annotations
                        </Badge>
                        <Badge color="gray" variant="dot">
                          current v{state.data.currentVersion}
                        </Badge>
                        <Badge color="gray" variant="dot">
                          {state.data.slug}
                        </Badge>
                      </Group>
                      <Group wrap="nowrap">
                        <Select
                          data={versionOptions}
                          onChange={(value) => {
                            setDetailState({ status: 'loading' })
                            setSelectedVersion(value ? Number(value) : null)
                            setFocusedBlockId(null)
                          }}
                          value={String(state.data.selectedVersion)}
                          w={200}
                        />
                        <ActionIcon
                          aria-label={clipboard.copied ? '已复制' : '复制 AI 提示词'}
                          color={clipboard.copied ? 'teal' : 'violet'}
                          onClick={handleCopyPrompt}
                          variant="light"
                        >
                          {clipboard.copied ? (
                            <IconClipboardCheck size={16} />
                          ) : (
                            <IconClipboard size={16} />
                          )}
                        </ActionIcon>
                        <ActionIcon
                          aria-label="刷新当前文档"
                          color="green"
                          onClick={refreshCurrentDocument}
                          variant="light"
                        >
                          <IconRefresh size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  </header>

                  <div className="main-grid">
                    <section className="preview-pane">
                      <MarkdownPreview
                        annotations={state.data.annotations}
                        busy={savingAnnotation}
                        content={state.data.content}
                        focusedBlockId={focusedBlockId}
                        onCreateAnnotation={handleCreateAnnotation}
                        version={state.data.selectedVersion}
                      />
                    </section>

                    <aside className="annotation-pane">
                      <ScrollArea className="annotation-pane__content" type="auto">
                        <Group justify="space-between" mb="md">
                          <Text fw={700}>Annotations</Text>
                          <Badge variant="light">{state.data.annotations.length}</Badge>
                        </Group>

                        {state.data.annotations.length > 0 ? (
                          <Stack gap="sm">
                            {state.data.annotations.map((annotation) => (
                              <AnnotationCard
                                annotation={annotation}
                                key={annotation.id}
                                onDelete={(id) => void handleDeleteAnnotation(id)}
                                onFocus={setFocusedBlockId}
                              />
                            ))}
                          </Stack>
                        ) : (
                          <Text c="dimmed" size="sm">
                            选中文档文本即可添加批注。
                          </Text>
                        )}
                      </ScrollArea>
                    </aside>
                  </div>
                </>
              ))
              .with({ status: 'loading' }, () => (
                <div className="empty-state">
                  <Loader color="green" />
                </div>
              ))
              .with({ status: 'error' }, (state) => (
                <div className="empty-state">
                  <Text c="red.3">{state.message}</Text>
                </div>
              ))
              .otherwise(() => (
                <div className="empty-state">
                  <Text c="dimmed">从左侧选择一篇文档。</Text>
                </div>
              ))}
          </main>
        </div>
        <Modal
          centered
          onClose={() => {
            if (!deletingDocumentId) {
              setDocumentPendingDeletion(null)
            }
          }}
          opened={documentPendingDeletion !== null}
          radius="xl"
          title="确认删除文档"
        >
          <Stack gap="md">
            <Text size="sm">
              删除后将物理移除文档、全部版本和关联批注，且无法恢复。
            </Text>
            <PaperLikeTitle title={documentPendingDeletion?.title ?? ''} />
            <Group justify="flex-end">
              <Button
                onClick={() => setDocumentPendingDeletion(null)}
                variant="subtle"
                disabled={deletingDocumentId !== null}
              >
                取消
              </Button>
              <Button
                color="red"
                loading={deletingDocumentId !== null}
                onClick={() => void handleConfirmDeleteDocument()}
              >
                确认删除
              </Button>
            </Group>
          </Stack>
        </Modal>
      </div>
    </MantineProvider>
  )
}

export default App

function formatTimestamp(value: string) {
  return value.replace('T', ' ').slice(0, 16)
}

function chooseDocumentId(items: DocumentListItem[], currentDocumentId: string | null) {
  if (currentDocumentId && items.some((item) => item.id === currentDocumentId)) {
    return currentDocumentId
  }

  return items[0]?.id ?? null
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}

function PaperLikeTitle({ title }: { title: string }) {
  return (
    <Box
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-md)',
        padding: '12px 14px',
      }}
    >
      <Text fw={600} size="sm">
        {title}
      </Text>
    </Box>
  )
}
