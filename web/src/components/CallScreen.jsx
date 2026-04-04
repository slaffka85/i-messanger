import { useEffect, useRef, useState, useCallback } from 'react'
import styles from './CallScreen.module.css'

// ── ICE / STUN configuration ──────────────────────────────────────
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

// ── States ────────────────────────────────────────────────────────
const STATUS = {
  CONNECTING:   'Connecting to server…',
  WAITING:      'Waiting for the other person…',
  CALLING:      'Starting call…',
  IN_CALL:      'In call',
  PEER_LEFT:    'The other person left the call.',
  ERROR:        'Connection error.',
}

export default function CallScreen({ roomId, onLeave, ws }) {
  const localVideoRef  = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef          = useRef(null)   // RTCPeerConnection
  const localStreamRef = useRef(null)   // MediaStream (local)
  const makingOfferRef = useRef(false)

  const [status, setStatus]       = useState(STATUS.CONNECTING)
  const [isMuted, setIsMuted]     = useState(false)
  const [isCamOff, setIsCamOff]   = useState(false)
  const [duration, setDuration]   = useState(0)
  const [remoteReady, setRemoteReady] = useState(false)

  // ── Helpers ────────────────────────────────────────────────────
  const sendSignal = useCallback((msg) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ ...msg, roomId }))
    }
  }, [roomId, ws])

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS)

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendSignal({ type: 'ice-candidate', payload: candidate })
      }
    }

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0]
        setRemoteReady(true)
        setStatus(STATUS.IN_CALL)
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setStatus(STATUS.PEER_LEFT)
      }
    }

    pcRef.current = pc
    return pc
  }, [sendSignal])

  const startCall = useCallback(async () => {
    setStatus(STATUS.CALLING)
    const pc = pcRef.current || createPeerConnection()

    // Add local tracks to the peer connection
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current)
      }
    }

    try {
      makingOfferRef.current = true
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      sendSignal({ type: 'offer', payload: pc.localDescription })
    } finally {
      makingOfferRef.current = false
    }
  }, [createPeerConnection, sendSignal])

  // ── WebSocket signaling ────────────────────────────────────────
  useEffect(() => {
    if (!ws) return

    const init = async () => {
      // 1. Get camera + mic
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        localStreamRef.current = stream
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }
      } catch (err) {
        console.error('Media error:', err)
        setStatus('Camera/mic access denied. Please allow permissions and reload.')
        return
      }

      // 2. Join room
      sendSignal({ type: 'join' })

      // 3. Setup message handler
      const handleMessage = async (event) => {
        const msg = JSON.parse(event.data)
        if (msg.roomId !== roomId && msg.roomId !== 'lobby') return

        switch (msg.type) {
          case 'waiting':
            setStatus(STATUS.WAITING)
            break

          case 'ready':
            // One peer initiates, the other waits for offer.
            createPeerConnection()
            if (msg.payload?.isInitiator) {
              await startCall()
            }
            break

          case 'offer': {
            if (!pcRef.current) {
              createPeerConnection()
              if (localStreamRef.current) {
                for (const track of localStreamRef.current.getTracks()) {
                  pcRef.current.addTrack(track, localStreamRef.current)
                }
              }
            }
            const pc = pcRef.current
            const offerCollision =
              makingOfferRef.current ||
              pc.signalingState !== 'stable'

            if (offerCollision) return 

            await pc.setRemoteDescription(new RTCSessionDescription(msg.payload))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            sendSignal({ type: 'answer', payload: pc.localDescription })
            setStatus(STATUS.CALLING)
            break
          }

          case 'answer':
            if (pcRef.current?.signalingState === 'have-local-offer') {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.payload))
            }
            break

          case 'ice-candidate':
            if (pcRef.current && msg.payload) {
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.payload))
              } catch (e) {
                if (!makingOfferRef.current) console.error('ICE error:', e)
              }
            }
            break

          case 'peer-left':
          case 'room-full':
            setStatus(msg.type === 'room-full' ? 'Room is full (max 2 people).' : STATUS.PEER_LEFT)
            break

          default:
            break
        }
      }

      ws.addEventListener('message', handleMessage)
      return () => {
        ws.removeEventListener('message', handleMessage)
      }
    }

    const cleanup = init()

    return () => {
      cleanup.then(unsub => unsub?.())
      sendSignal({ type: 'leave' }) // Notify server about intentional exit
      localStreamRef.current?.getTracks().forEach(t => t.stop())
      pcRef.current?.close()
      pcRef.current = null
    }
  }, [roomId, ws, createPeerConnection, sendSignal, startCall])

  // ── Call duration timer ────────────────────────────────────────
  useEffect(() => {
    if (status !== STATUS.IN_CALL) return
    const id = setInterval(() => setDuration(d => d + 1), 1000)
    return () => clearInterval(id)
  }, [status])

  const formatDuration = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  // ── Controls ───────────────────────────────────────────────────
  const toggleMute = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      setIsMuted(m => !m)
    }
  }

  const toggleCamera = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled
      setIsCamOff(c => !c)
    }
  }

  const handleLeave = () => {
    sendSignal({ type: 'leave' })
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    pcRef.current?.close()
    wsRef.current?.close()
    onLeave()
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className={styles.room}>

      {/* Remote video — full background */}
      <div className={`${styles.remoteContainer} ${!remoteReady ? styles.empty : ''}`}>
        <video
          ref={remoteVideoRef}
          id="remote-video"
          className={styles.remoteVideo}
          autoPlay
          playsInline
        />
        {!remoteReady && (
          <div className={styles.remoteOverlay}>
            <div className={styles.spinner} />
            <p className={styles.statusText}>{status}</p>
            <p className={styles.roomBadge}>Room: <strong>{roomId}</strong></p>
          </div>
        )}
      </div>

      {/* Local video — pip */}
      <div className={`${styles.localContainer} ${isCamOff ? styles.camOff : ''}`}>
        <video
          ref={localVideoRef}
          id="local-video"
          className={styles.localVideo}
          autoPlay
          playsInline
          muted
        />
        {isCamOff && <div className={styles.camOffLabel}>Camera off</div>}
      </div>

      {/* Top bar */}
      <div className={styles.topBar}>
        <div className={styles.brand}>
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="url(#tlg)" />
            <path d="M9 12h14M9 16h10M9 20h7" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            <defs>
              <linearGradient id="tlg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="#6c63ff"/><stop offset="1" stopColor="#a78bfa"/>
              </linearGradient>
            </defs>
          </svg>
          <span>iMessanger</span>
        </div>
        {status === STATUS.IN_CALL && (
          <div className={styles.timer}>
            <span className={styles.dot} />
            {formatDuration(duration)}
          </div>
        )}
        <div className={styles.roomTag}>#{roomId}</div>
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <button
          id="btn-toggle-mute"
          className={`${styles.ctrlBtn} ${isMuted ? styles.ctrlBtnOff : ''}`}
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted
            ? <MicOffIcon />
            : <MicIcon />}
          <span>{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button
          id="btn-end-call"
          className={styles.ctrlBtnEnd}
          onClick={handleLeave}
          title="End call"
        >
          <PhoneOffIcon />
          <span>End</span>
        </button>

        <button
          id="btn-toggle-camera"
          className={`${styles.ctrlBtn} ${isCamOff ? styles.ctrlBtnOff : ''}`}
          onClick={toggleCamera}
          title={isCamOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isCamOff
            ? <VideoOffIcon />
            : <VideoIcon />}
          <span>{isCamOff ? 'Cam On' : 'Cam Off'}</span>
        </button>
      </div>
    </div>
  )
}

// ── Inline SVG icons ──────────────────────────────────────────────
function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  )
}

function MicOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/>
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  )
}

function VideoOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34"/>
      <polygon points="23 7 16 12 23 17 23 7"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

function PhoneOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A2 2 0 0 1 10 18"/>
      <path d="M14 2a4 4 0 0 1 4 4"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}
