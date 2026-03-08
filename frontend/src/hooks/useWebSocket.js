import { useState, useEffect, useRef, useCallback } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
const MAX_RECONNECT_DELAY = 30000;

export default function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [newOpportunities, setNewOpportunities] = useState([]);
  const wsRef = useRef(null);
  const reconnectDelayRef = useRef(1000);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    const token = localStorage.getItem('radar_token');
    if (!token) return;

    setConnectionStatus('connecting');

    try {
      const ws = new WebSocket(`${WS_URL}/ws?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setConnectionStatus('connected');
        reconnectDelayRef.current = 1000;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'new_opportunity') {
            setNewOpportunities((prev) => [data.data, ...prev]);
          }
        } catch {
          // ignore invalid JSON
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setConnectionStatus('disconnected');
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      scheduleReconnect();
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    const delay = reconnectDelayRef.current;
    reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
    setConnectionStatus('reconnecting');
    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  const clearOpportunities = useCallback(() => {
    setNewOpportunities([]);
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connect]);

  return { connected, newOpportunities, connectionStatus, clearOpportunities };
}
