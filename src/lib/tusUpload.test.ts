import { describe, expect, it } from 'vitest'
import { TUS_CHUNK_BYTES, isSizeRejection, storageResumableEndpoint, videoUploadFailure } from './tusUpload'

describe('resumable video upload', () => {
  it('uses the direct storage host and a 6 MB chunk', () => {
    expect(storageResumableEndpoint('https://exampleproject.supabase.co')).toBe(
      'https://exampleproject.storage.supabase.co/storage/v1/upload/resumable',
    )
    expect(TUS_CHUNK_BYTES).toBe(6 * 1024 * 1024)
  })

  it('explains a server size rejection', () => {
    expect(isSizeRejection('413 Payload Too Large')).toBe(true)
    expect(isSizeRejection('The object exceeded the maximum allowed size')).toBe(true)
    const error = videoUploadFailure(new Error('Payload too large'))
    expect(error.message).toMatch(/lower than 50 MB/)
    expect(videoUploadFailure(new Error('network down')).message).toBe('network down')
  })
})
