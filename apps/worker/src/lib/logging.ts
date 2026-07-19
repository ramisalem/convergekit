export function summarizeErrorForLog(err: unknown): Record<string, unknown> {
  if (!err || typeof err !== 'object') {
    return { message: String(err) }
  }

  const error = err as {
    name?: string
    message?: string
    statusCode?: number
    url?: string
    code?: string | number
    isRetryable?: boolean
  }

  return {
    name: error.name,
    message: error.message,
    statusCode: error.statusCode,
    url: error.url,
    code: error.code,
    isRetryable: error.isRetryable,
  }
}
