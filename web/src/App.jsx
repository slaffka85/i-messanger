import { useState, useCallback, useEffect, useRef } from 'react'
import LobbyScreen from './components/LobbyScreen.jsx'
import CallScreen from './components/CallScreen.jsx'
import TelephonyAudio from './utils/TelephonyAudio.js'

// Helper for generating/retrieving a persistent clientId
const getPersistentClientId = () => {
    const saved = localStorage.getItem('imessanger_client_id');
    if (saved) return saved;
    const newId = `User_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    localStorage.setItem('imessanger_client_id', newId);
    return newId;
};

export default function App() {
  const [screen, setScreen] = useState('lobby') // 'lobby' | 'call'
  const [clientId] = useState(getPersistentClientId)
  const [targetId, setTargetId] = useState('')
  const [onlineClients, setOnlineClients] = useState([])
  const [incomingCall, setIncomingCall] = useState(null) // { fromId }
  const [isInitiator, setIsInitiator] = useState(false)
  const [isWaiting, setIsWaiting] = useState(false)
  const [audioStatus, setAudioStatus] = useState('uninitialized')
  const wsRef = useRef(null)

    const sendMessage = useCallback((msg) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('<<< [SIGNAL SEND]', msg)
        wsRef.current.send(JSON.stringify(msg))
      }
    }, [])

    // 1. Manage Global WebSocket & Permissions
    useEffect(() => {
        // Request standard browser permission
        if ("Notification" in window) {
            Notification.requestPermission().then(permission => {
              console.log('>>> [PERM] Notifications:', permission);
              if (permission === 'granted') TelephonyAudio.init();
            });
        }

        // Track audio state
        TelephonyAudio.onStateChange = (state) => setAudioStatus(state);
        setAudioStatus(TelephonyAudio.getState());

        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const wsUrl = `${protocol}://${window.location.host}/signal`
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          console.log('>>> [WS] Connected as', clientId)
          sendMessage({ type: 'identify', clientId })
        }

    const handleMessage = (event) => {
      const msg = JSON.parse(event.data)
      console.log('>>> [SIGNAL RECV]', msg)

      switch (msg.type) {
        case 'client-list':
          // Update the list of online clients, excluding self
          setOnlineClients(msg.clients.filter(id => id !== clientId))
          break

        case 'incoming-call':
          setIncomingCall({ fromId: msg.fromId })
          break

        case 'offer':
          // Auto-transition to call screen if receiving an offer
          setTargetId(msg.fromId)
          setIsInitiator(false)
          setIsWaiting(false)
          setScreen('call')
          break

        case 'call-accepted':
          console.log('>>> [CALL] Accepted by', msg.fromId)
          TelephonyAudio.playClick()
          setIsWaiting(false)
          break

        case 'call-declined':
          console.log('>>> [CALL] Declined by', msg.fromId)
          TelephonyAudio.playClick()
          alert('Call declined by ' + msg.fromId)
          setScreen('lobby')
          setTargetId('')
          setIsWaiting(false)
          break

        case 'leave':
          console.log('>>> [CALL] Peer left:', msg.fromId)
          TelephonyAudio.playClick()
          setScreen('lobby')
          setTargetId('')
          setIsWaiting(false)
          break

        default:
          break
      }
    }

    ws.addEventListener('message', handleMessage)

    return () => {
      ws.removeEventListener('message', handleMessage)
      ws.close()
    }
  }, [clientId, sendMessage])

  // 2. Handle Ringtones and Ringback
  useEffect(() => {
    if (incomingCall && screen === 'lobby') {
      TelephonyAudio.startRingtone()
    } else {
      TelephonyAudio.stopRingtone()
    }
  }, [incomingCall, screen])

  useEffect(() => {
    if (isWaiting && screen === 'call') {
      TelephonyAudio.startRingback()
    } else {
      TelephonyAudio.stopRingback()
    }
  }, [isWaiting, screen])

  const handleCall = useCallback((id) => {
    TelephonyAudio.playClick()
    setTargetId(id)
    setIsInitiator(true)
    setIsWaiting(true)
    setScreen('call')
    sendMessage({ type: 'call', targetId: id })
  }, [sendMessage])

  const handleAcceptCall = useCallback(() => {
    if (incomingCall) {
      TelephonyAudio.playClick()
      const fromId = incomingCall.fromId
      setTargetId(fromId)
      setIsInitiator(false)
      setIsWaiting(false)
      setScreen('call')
      setIncomingCall(null)
      sendMessage({ type: 'call-accepted', targetId: fromId })
    }
  }, [incomingCall, sendMessage])

  const handleDeclineCall = useCallback(() => {
    if (incomingCall) {
        TelephonyAudio.playClick()
        sendMessage({ type: 'call-declined', targetId: incomingCall.fromId })
        setIncomingCall(null)
    }
  }, [incomingCall, sendMessage])

  const handleLeave = useCallback(() => {
    TelephonyAudio.playClick()
    TelephonyAudio.stopAll()
    sendMessage({ type: 'leave', targetId })
    setScreen('lobby')
    setTargetId('')
    setIsWaiting(false)
  }, [targetId, sendMessage])

  return (
    <div onClick={() => TelephonyAudio.init()}>
      {incomingCall && screen === 'lobby' && (
        <div style={{
          position: 'fixed', top: 20, right: 20, padding: 20, 
          background: '#fff', border: '1px solid #ccc', borderRadius: 8, 
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000,
          display: 'flex', flexDirection: 'column', gap: 10
        }}>
          <strong>Incoming call from {incomingCall.fromId}</strong>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleAcceptCall} style={{ background: '#4CAF50', color: 'white', padding: '5px 15px', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Accept</button>
            <button onClick={handleDeclineCall} style={{ background: '#f44336', color: 'white', padding: '5px 15px', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Decline</button>
          </div>
        </div>
      )}

      {screen === 'lobby' ? (
        <LobbyScreen 
          myId={clientId} 
          onlineClients={onlineClients} 
          onCall={handleCall}
          audioStatus={audioStatus}
        />
      ) : (
        <CallScreen 
          myId={clientId} 
          targetId={targetId} 
          isInitiator={isInitiator}
          isWaiting={isWaiting}
          onLeave={handleLeave} 
          ws={wsRef.current} 
        />
      )}
    </div>
  )
}
