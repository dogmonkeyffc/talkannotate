import { Alert, Loader, Stack, Text, useMantineColorScheme } from '@mantine/core'
import { useEffect, useId, useState } from 'react'
import mermaid from 'mermaid'

type MermaidDiagramProps = {
  chart: string
}

type MermaidState =
  | null
  | { chart: string; status: 'ready'; svg: string }
  | { chart: string; message: string; status: 'error' }

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const [state, setState] = useState<MermaidState>(null)
  const id = useId().replace(/:/g, '-')
  const { colorScheme } = useMantineColorScheme()

  useEffect(() => {
    mermaid.initialize({
      securityLevel: 'loose',
      startOnLoad: false,
      theme: colorScheme === 'dark' ? 'dark' : 'default',
    })

    let cancelled = false

    void mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (!cancelled) {
          setState({ chart, status: 'ready', svg })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            chart,
            message: error instanceof Error ? error.message : 'Unable to render Mermaid diagram.',
            status: 'error',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [chart, colorScheme, id])

  if (state === null || state.chart !== chart) {
    return (
      <Stack align="center" gap="xs" py="md">
        <Loader color="violet" size="sm" />
        <Text c="gray.4" size="sm">
          Rendering Mermaid diagram…
        </Text>
      </Stack>
    )
  }

  if (state.status === 'error') {
    return (
      <Alert color="red" title="Mermaid render failed" variant="light">
        {state.message}
      </Alert>
    )
  }

  return <div className="mermaid-shell" dangerouslySetInnerHTML={{ __html: state.svg }} />
}
