const API_TIME_ZONE = 'Asia/Shanghai'
const API_TIME_ZONE_OFFSET = '+08:00'

const timestampFormatter = new Intl.DateTimeFormat('sv-SE', {
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
  const isoUtcValue = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(isoUtcValue.endsWith('Z') ? isoUtcValue : `${isoUtcValue}Z`)

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp value: ${value}`)
  }

  return `${timestampFormatter.format(date).replace(' ', 'T')}${API_TIME_ZONE_OFFSET}`
}

export function formatCurrentDateForApi(now = new Date()) {
  return dateFormatter.format(now)
}
