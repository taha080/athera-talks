import { Upload } from 'tus-js-client'

export const TUS_CHUNK_BYTES = 6 * 1024 * 1024

export function storageResumableEndpoint(projectUrl: string): string {
  const url = new URL(projectUrl)
  const host = url.hostname
  if (host.endsWith('.supabase.co')) {
    const projectRef = host.slice(0, -'.supabase.co'.length)
    return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`
  }
  return `${url.origin}/storage/v1/upload/resumable`
}

export function isSizeRejection(message: string): boolean {
  return /413|payload too large|entity too large|maximum allowed size|maximum size|file size limit|object exceeded|exceeded the maximum|too large/i.test(message)
}

export function videoUploadFailure(error: unknown): Error {
  const message = errorText(error)
  if (isSizeRejection(message)) {
    return new Error('The server rejected this video because of its size. The project upload limit can be lower than 50 MB on the free plan.')
  }
  return new Error(message || 'Could not upload that video.')
}

function errorText(error: unknown): string {
  if (!error) return ''
  if (error instanceof Error) {
    const response = (error as { originalResponse?: { getBody?: () => string } }).originalResponse
    const body = response?.getBody?.() ?? ''
    return `${error.message} ${body}`.trim()
  }
  return String(error)
}

export type ResumableUpload = {
  endpoint: string
  accessToken: string
  anonKey: string
  bucketName: string
  objectName: string
  file: Blob
  contentType: string
  onProgress?: (loaded: number, total: number) => void
  signal?: AbortSignal
}

export function uploadChatVideo(input: ResumableUpload): Promise<void> {
  return new Promise((resolve, reject) => {
    if (input.signal?.aborted) {
      reject(new Error('Upload cancelled.'))
      return
    }
    let settled = false
    function finish(error?: Error) {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve()
    }
    const upload = new Upload(input.file, {
      endpoint: input.endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        apikey: input.anonKey,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      storeFingerprintForResuming: false,
      metadata: {
        bucketName: input.bucketName,
        objectName: input.objectName,
        contentType: input.contentType,
        cacheControl: '3600',
      },
      chunkSize: TUS_CHUNK_BYTES,
      onError(error) {
        finish(input.signal?.aborted ? new Error('Upload cancelled.') : videoUploadFailure(error))
      },
      onProgress(loaded, total) {
        input.onProgress?.(loaded, total)
      },
      onSuccess() {
        finish()
      },
    })
    input.signal?.addEventListener(
      'abort',
      () => {
        void upload.abort(true).catch(() => undefined)
        finish(new Error('Upload cancelled.'))
      },
      { once: true },
    )
    input.onProgress?.(0, input.file.size)
    upload.start()
  })
}
