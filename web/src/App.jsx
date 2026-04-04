import { useState, useCallback, useEffect, useRef } from 'react'
import LobbyScreen from './components/LobbyScreen.jsx'
import CallScreen from './components/CallScreen.jsx'

export default function App() {
  const [screen, setScreen] = useState('lobby') // 'lobby' | 'call'
  const [roomId, setRoomId] = useState('')
  const [availableRooms, setAvailableRooms] = useState([])
  const wsRef = useRef(null)

  // 1. Manage Global WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${protocol}://${window.location.host}/signal`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    const handleMessage = (event) => {
      const msg = JSON.parse(event.data)
      console.log('>>> [SIGNAL]', msg) // DEBUG LOG
      
      if (msg.type === 'room-list') {
        setAvailableRooms(msg.payload.rooms || [])
      }
    }

    ws.addEventListener('message', handleMessage)

    return () => {
      ws.removeEventListener('message', handleMessage)
      ws.close()
    }
  }, [])

  const refreshRooms = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('>>> [ACTION] Refreshing room list...')
      wsRef.current.send(JSON.stringify({ type: 'get-rooms' }))
    }
  }, [])

  const handleJoin = useCallback((id) => {
    setRoomId(id)
    setScreen('call')
  }, [])

  const handleLeave = useCallback(() => {
    setScreen('lobby')
    setRoomId('')
  }, [])

  return screen === 'lobby'
    ? <LobbyScreen onJoin={handleJoin} availableRooms={availableRooms} onRefresh={refreshRooms} />
    : <CallScreen roomId={roomId} onLeave={handleLeave} ws={wsRef.current} />
}
