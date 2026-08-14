import api from './api';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4000/ws';
const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

class WebSocketService {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.isConnected = false;
    this.listeners = new Map();
    this.messageQueue = [];
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
  }

  connect(token) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    const url = `${WS_URL}?token=${token}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Send queued messages
      this.flushMessageQueue();
      
      // Start heartbeat
      this.startHeartbeat();
      
      // Notify listeners
      this.emit('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      this.isConnected = false;
      this.stopHeartbeat();
      
      // Notify listeners
      this.emit('disconnected', { code: event.code, reason: event.reason });
      
      // Attempt to reconnect
      if (event.code !== 1000) { // Not a clean close
        this.attemptReconnect(token);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    
    this.isConnected = false;
    this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
  }

  attemptReconnect(token) {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('Max reconnect attempts reached');
      this.emit('reconnectFailed');
      return;
    }

    this.reconnectAttempts++;
    const delay = RECONNECT_INTERVAL * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect(token);
    }, delay);
  }

  send(type, data, options = {}) {
    const message = { type, data, ...options };
    
    if (this.isConnected) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue message for later
      this.messageQueue.push(message);
      
      // Limit queue size
      if (this.messageQueue.length > 100) {
        this.messageQueue.shift();
      }
    }
  }

  flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.ws.send(JSON.stringify(message));
    }
  }

  handleMessage(message) {
    const { type, channel, data } = message;
    
    // Emit to specific channel listeners
    if (channel) {
      this.emit(`channel:${channel}`, data);
    }
    
    // Emit to type listeners
    this.emit(type, data);
    
    // Handle special message types
    switch (type) {
      case 'telemetry':
        this.handleTelemetry(data);
        break;
      case 'alert':
        this.handleAlert(data);
        break;
      case 'ping':
        this.handlePing();
        break;
    }
  }

  handleTelemetry(data) {
    this.emit('telemetry', data);
  }

  handleAlert(data) {
    // Show notification for critical alerts
    if (data.priority === 'critical' || data.priority === 'high') {
      this.showNotification(data);
    }
    
    this.emit('alert', data);
  }

  handlePing() {
    this.send('pong');
  }

  showNotification(alert) {
    if (Notification.permission === 'granted') {
      new Notification('VigilOS Alert', {
        body: alert.message || 'New alert received',
        icon: '/favicon.ico',
        tag: alert.id,
        requireInteraction: alert.priority === 'critical'
      });
    }
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.send('ping');
      }
    }, 30000); // 30 seconds
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  subscribe(channel, callback) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    
    this.listeners.get(channel).add(callback);
    
    // Send subscribe message
    this.send('subscribe', { channels: [channel] });
    
    // Return unsubscribe function
    return () => {
      this.listeners.get(channel)?.delete(callback);
      
      if (this.listeners.get(channel)?.size === 0) {
        this.listeners.delete(channel);
        this.send('unsubscribe', { channels: [channel] });
      }
    };
  }

  unsubscribe(channel) {
    this.listeners.delete(channel);
    this.send('unsubscribe', { channels: [channel] });
  }

  emit(event, data) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('WebSocket listener error:', error);
        }
      });
    }
  }

  on(event, callback) {
    return this.subscribe(event, callback);
  }

  off(event, callback) {
    if (callback) {
      this.listeners.get(event)?.delete(callback);
    } else {
      this.listeners.delete(event);
    }
  }

  getConnectionState() {
    if (!this.ws) return 'DISCONNECTED';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'CONNECTING';
      case WebSocket.OPEN:
        return 'CONNECTED';
      case WebSocket.CLOSING:
        return 'CLOSING';
      case WebSocket.CLOSED:
        return 'DISCONNECTED';
      default:
        return 'UNKNOWN';
    }
  }

  getStats() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
      listeners: Array.from(this.listeners.keys()),
      connectionState: this.getConnectionState()
    };
  }
}

export default new WebSocketService();
