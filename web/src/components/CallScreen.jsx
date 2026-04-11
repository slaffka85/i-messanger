import { useEffect, useRef, useState, useCallback } from 'react'
import styles from './CallScreen.module.css'
import Chat from './Chat'

// ── ICE / STUN configuration ──────────────────────────────────────
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

// ── States ────────────────────────────────────────────────────────
const STATUS = {
  CONNECTING:   'Connecting to peer…',
  WAITING:      'Waiting for response…',
  CALLING:      'Starting call…',
  IN_CALL:      'In call',
  PEER_LEFT:    'The other person left the call.',
  ERROR:        'Connection error.',
}

export default function CallScreen({ myId, targetId, isInitiator, isWaiting, onLeave, ws }) {
  const localVideoRef  = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef          = useRef(null)   // RTCPeerConnection
  const localStreamRef = useRef(null)   // MediaStream (local)
  const makingOfferRef = useRef(false)
  
  // To handle messages that arrive before PeerConnection is ready
  const pendingCandidatesRef = useRef([])
  const remoteOfferRef = useRef(null)

  const [status, setStatus]       = useState(STATUS.CONNECTING)
  const [isMuted, setIsMuted]     = useState(false)
  const [isCamOff, setIsCamOff]   = useState(false)
  const [duration, setDuration]   = useState(0)
  const [remoteReady, setRemoteReady] = useState(false)

  // ── Helpers ────────────────────────────────────────────────────
  const sendSignal = useCallback((msg) => {
    if (ws?.readyState === WebSocket.OPEN) {
      const payload = { ...msg, targetId };
      console.log('>>> [WS SEND]', payload.type);
      ws.send(JSON.stringify(payload))
    }
  }, [targetId, ws])

  const stopLocalStream = useCallback(() => {
    if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
    }
    if (localStreamRef.current) {
        console.log('>>> [ACTION] Force stopping all tracks');
        localStreamRef.current.getTracks().forEach(track => {
            track.stop();
            track.enabled = false;
        });
        localStreamRef.current = null;
    }
  }, [])

  const createPeerConnection = useCallback(() => {
    if (pcRef.current) return pcRef.current; 

    console.log('>>> [WebRTC] Creating PeerConnection');
    const pc = new RTCPeerConnection(ICE_SERVERS)

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendSignal({ type: 'ice-candidate', payload: candidate })
      }
    }

    pc.ontrack = (event) => {
      console.log('>>> [WebRTC] Remote track received');
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0]
        setRemoteReady(true)
        setStatus(STATUS.IN_CALL)
      }
    }

    pc.onconnectionstatechange = () => {
      console.log('>>> [WebRTC] Connection state:', pc.connectionState);
      const isLost = ['disconnected', 'failed', 'closed'].includes(pc.connectionState);
      
      if (isLost) {
        setStatus(STATUS.PEER_LEFT)
        stopLocalStream()
        // Wait a bit to show the message then leave
        setTimeout(() => {
          onLeave()
        }, 1500)
      }
      
      if (pc.connectionState === 'connected') {
          setStatus(STATUS.IN_CALL)
      }
    }

    pcRef.current = pc
    return pc
  }, [sendSignal])

  const addLocalTracksToPC = useCallback((pc) => {
    if (!localStreamRef.current) return;
    console.log('>>> [WebRTC] Adding local tracks to PC');
    for (const track of localStreamRef.current.getTracks()) {
      const alreadyAdded = pc.getSenders().some(s => s.track === track)
      if (!alreadyAdded) {
        pc.addTrack(track, localStreamRef.current)
      }
    }
  }, [])

  const startCall = useCallback(async () => {
    console.log('>>> [ACTION] Initiating call (startCall)');
    setStatus(STATUS.CALLING)
    const pc = createPeerConnection()
    addLocalTracksToPC(pc)

    try {
      makingOfferRef.current = true
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      sendSignal({ type: 'offer', payload: pc.localDescription })
    } catch (e) {
      console.error('Failed to start call:', e)
    } finally {
      makingOfferRef.current = false
    }
  }, [createPeerConnection, addLocalTracksToPC, sendSignal])

  const processOffer = useCallback(async (offerPayload) => {
    const pc = createPeerConnection()
    addLocalTracksToPC(pc)
    
    const offerCollision = makingOfferRef.current || pc.signalingState !== 'stable'
    if (offerCollision) {
        console.warn('>>> [WebRTC] Offer collision detected');
        return 
    }

    console.log('>>> [WebRTC] Processing offer and sending answer');
    await pc.setRemoteDescription(new RTCSessionDescription(offerPayload))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    sendSignal({ type: 'answer', payload: pc.localDescription })
    
    // Process any candidates that arrived early
    while (pendingCandidatesRef.current.length > 0) {
        const cand = pendingCandidatesRef.current.shift()
        await pc.addIceCandidate(new RTCIceCandidate(cand))
    }
  }, [createPeerConnection, addLocalTracksToPC, sendSignal])

  // ── WebSocket signaling listener (Synchronous setup) ───────────
  useEffect(() => {
    if (!ws) return

    const handleMessage = async (event) => {
        const msg = JSON.parse(event.data)
        if (msg.fromId !== targetId) return
        
        console.log('>>> [SIGNAL RECEIVED]', msg.type);

        switch (msg.type) {
          case 'offer': {
            console.log('>>> [WebRTC] Offer received, saving as pending');
            remoteOfferRef.current = msg.payload
            
            // If media is already ready, process now
            if (localStreamRef.current) {
                processOffer(msg.payload)
            }
            break
          }

          case 'answer':
            if (pcRef.current?.signalingState === 'have-local-offer') {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.payload))
              // Process any candidates that arrived early
              while (pendingCandidatesRef.current.length > 0) {
                  const cand = pendingCandidatesRef.current.shift()
                  await pcRef.current.addIceCandidate(new RTCIceCandidate(cand))
              }
            }
            break

          case 'ice-candidate':
            if (msg.payload) {
                const pc = pcRef.current
                if (pc && pc.remoteDescription) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(msg.payload))
                    } catch (e) {
                        console.error('ICE error:', e)
                    }
                } else {
                    console.log('>>> [WebRTC] Queuing ICE candidate');
                    pendingCandidatesRef.current.push(msg.payload)
                }
            }
            break

          case 'peer-left':
            console.log('>>> [ACTION] Peer left (received signal)');
            stopLocalStream();
            setStatus(STATUS.PEER_LEFT)
            // Auto return to lobby after 1.5s
            setTimeout(() => onLeave(), 1500);
            break

          default:
            break
        }
      }

      ws.addEventListener('message', handleMessage)
      
      return () => {
          ws.removeEventListener('message', handleMessage)
          stopLocalStream();
          pcRef.current?.close()
          pcRef.current = null
          pendingCandidatesRef.current = []
      }
  }, [ws, targetId, createPeerConnection, addLocalTracksToPC, sendSignal, stopLocalStream, onLeave])

  // ── Camera Initialization ─────────────────────────────────────
  useEffect(() => {
    const getMedia = async () => {
        try {
            console.log('>>> [ACTION] Fetching media stream');
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            localStreamRef.current = stream
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream
            }
            // If PeerConnection already exists (e.g. we got an offer while getting media), add tracks now
            if (pcRef.current) {
                addLocalTracksToPC(pcRef.current)
            }
            // If we have a pending offer, process it now that media is ready
            if (remoteOfferRef.current) {
                processOffer(remoteOfferRef.current)
            }
        } catch (err) {
            console.error('Media error:', err)
            setStatus('Camera/mic access denied.')
        }
    }
    getMedia()

    return () => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
    }
  }, [addLocalTracksToPC, processOffer])

  // ── Call Initiation logic ──────────────────────────────────
  useEffect(() => {
     // Wait until NOT in waiting mode AND is initiator
     if (isInitiator && !isWaiting && localStreamRef.current) {
         startCall()
     }
  }, [isInitiator, isWaiting, startCall])

  // ── Call duration timer ────────────────────────────────────────
  useEffect(() => {
    if (status === STATUS.IN_CALL) {
        const id = setInterval(() => setDuration(d => d + 1), 1000)
        return () => clearInterval(id)
    }
  }, [status])

  const formatDuration = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

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

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <div className={styles.room}>

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
                <p className={styles.statusText}>{isWaiting ? `Calling ${targetId}...` : status}</p>
                <p className={styles.roomBadge}>{isWaiting ? 'Waiting for answer' : `Target: ${targetId}`}</p>
              </div>
            )}
          </div>

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
            <div className={styles.roomTag}>Peer: {targetId}</div>
          </div>

          <div className={styles.controls}>
            <button
              className={`${styles.ctrlBtn} ${isMuted ? styles.ctrlBtnOff : ''}`}
              onClick={toggleMute}
            >
              {isMuted ? <MicOffIcon /> : <MicIcon />}
              <span>{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>

            <button
              className={styles.ctrlBtnEnd}
              onClick={() => {
                stopLocalStream();
                onLeave();
              }}
            >
              <PhoneOffIcon />
              <span>End</span>
            </button>

            <button
              className={`${styles.ctrlBtn} ${isCamOff ? styles.ctrlBtnOff : ''}`}
              onClick={toggleCamera}
            >
              {isCamOff ? <VideoOffIcon /> : <VideoIcon />}
              <span>{isCamOff ? 'Cam On' : 'Cam Off'}</span>
            </button>
          </div>
        </div>
      </div>
      <Chat myId={myId} targetId={targetId} ws={ws} />
    </div>
  )
}

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
