import { useEffect, useCallback, useRef } from 'react';
import { useTextToSpeech } from './useTextToSpeech';

export const useNotifications = () => {
  const { speakTaskReminder } = useTextToSpeech();
  const permissionRef = useRef(Notification.permission);

  useEffect(() => {
    permissionRef.current = Notification.permission;
  }, []);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      permissionRef.current = permission;
      return permission === 'granted';
    }

    return false;
  }, []);

  const showNotification = useCallback((title, options = {}) => {
    if (Notification.permission !== 'granted') {
      console.warn('Notification permission not granted');
      return null;
    }

    const notification = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      vibrate: [200, 100, 200],
      ...options
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
      if (options.onTaskClick) {
        options.onTaskClick();
      }
    };

    return notification;
  }, []);

  const notifyTask = useCallback((task) => {
    const notification = showNotification(`Time for: ${task.name}`, {
      body: `It's ${new Date(task.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Let's do this!`,
      tag: task.id,
      requireInteraction: true,
      onTaskClick: () => {
        speakTaskReminder(task.name);
      }
    });

    // Also speak the reminder
    speakTaskReminder(task.name);

    return notification;
  }, [showNotification, speakTaskReminder]);

  const isSupported = typeof window !== 'undefined' && 'Notification' in window;
  const isGranted = permissionRef.current === 'granted';

  return {
    requestPermission,
    showNotification,
    notifyTask,
    isSupported,
    isGranted,
    permission: permissionRef.current
  };
};
