// Public STUN servers help the two browsers find each other.
// There is no TURN relay in v1, so some locked-down networks cannot connect.
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS })
}

export function mediaError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Microphone permission is blocked. Allow the mic, then try the call again.'
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'No microphone was found on this device.'
  }
  if (error instanceof Error && error.message) return error.message
  return 'Could not start the voice call.'
}
