/**
 * SSE notification endpoint for BullMQ job progress — JDW-51
 *
 * GET /api/notifications/jobs/:jobId?queue=<queue-name>
 *
 * Opens a Server-Sent Events stream and forwards `progress`, `completed`,
 * and `failed` BullMQ events for the given job. The stream closes automatically
 * when the job reaches a terminal state (completed or failed).
 *
 * QueueEvents uses Redis pub/sub internally, so this works correctly across
 * multiple API nodes without sticky sessions.
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { QueueEvents } from 'bullmq'
import { Redis as IORedis } from 'ioredis'
import { QUEUE_NAMES } from '@convergekit/queues'

export const notificationRoutes = new Hono()

const VALID_QUEUES = new Set<string>(Object.values(QUEUE_NAMES))

notificationRoutes.get('/jobs/:jobId', (c) => {
  const jobId = c.req.param('jobId')
  const queueName = c.req.query('queue')

  if (!queueName || !VALID_QUEUES.has(queueName)) {
    return c.json(
      {
        error: 'Missing or invalid `queue` query param',
        validQueues: Object.values(QUEUE_NAMES),
      },
      400,
    )
  }

  return streamSSE(c, async (stream) => {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null })
    const queueEvents = new QueueEvents(queueName, { connection })

    stream.onAbort(async () => {
      await queueEvents.close()
      connection.disconnect()
    })

    await new Promise<void>((resolve) => {
      queueEvents.on('progress', ({ jobId: id, data }) => {
        if (id !== jobId) return
        stream
          .writeSSE({ event: 'progress', data: JSON.stringify({ jobId: id, data }) })
          .catch(() => undefined)
      })

      queueEvents.on('completed', ({ jobId: id, returnvalue }) => {
        if (id !== jobId) return
        stream
          .writeSSE({ event: 'completed', data: JSON.stringify({ jobId: id, returnvalue }) })
          .then(() => resolve())
          .catch(() => resolve())
      })

      queueEvents.on('failed', ({ jobId: id, failedReason }) => {
        if (id !== jobId) return
        stream
          .writeSSE({ event: 'failed', data: JSON.stringify({ jobId: id, failedReason }) })
          .then(() => resolve())
          .catch(() => resolve())
      })
    })

    await queueEvents.close()
    connection.disconnect()
  })
})
