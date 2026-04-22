const API_TIME_ZONE = 'Asia/Shanghai'

const timestampFormatter = new Intl.DateTimeFormat('en', {
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  month: '2-digit',
  second: '2-digit',
  timeZone: API_TIME_ZONE,
  year: 'numeric',
})

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: API_TIME_ZONE,
  year: 'numeric',
})

export function formatUtcTimestampForApi(value: string) {
  const date = parseUtcTimestamp(value)

  const parts = Object.fromEntries(
    timestampFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${getOffsetSuffix(date)}`
}

export function formatCurrentDateForApi(now = new Date()) {
  return dateFormatter.format(now)
}

function parseUtcTimestamp(value: string) {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z|([+-]\d{2}:\d{2}))?$/,
  )

  if (!match) {
    throw new Error(`Invalid UTC timestamp value: ${value}`)
  }

  const [, datePart, timePart, offsetPart] = match
  const normalizedValue = `${datePart}T${timePart}${offsetPart ?? 'Z'}`
  const parsedDate = new Date(normalizedValue)

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Invalid UTC timestamp value: ${value}`)
  }

  return parsedDate
}

function getOffsetSuffix(date: Date) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: API_TIME_ZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(date)
  const offset = parts.find((part) => part.type === 'timeZoneName')?.value

  if (!offset) {
    throw new Error(`Unable to determine timezone offset for ${API_TIME_ZONE}`)
  }

  return offset.replace('GMT', '')
}
