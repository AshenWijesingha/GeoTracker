'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  LocationData,
  DeviceInfo,
  getDeviceInfo,
  getIPAddress,
  getCurrentPosition,
  getGeolocationErrorMessage,
  generateTrackingId,
  getOrCreateTrackerAsync,
  addLocationToTrackerAsync,
} from '@/lib/storage';
import styles from './page.module.css';

type Status = 'loading' | 'success' | 'error';

export default function StandaloneTracker() {
  const [status, setStatus] = useState<Status>('loading');
  const [statusMessage, setStatusMessage] = useState('Initializing tracking system...');
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [ipAddress, setIpAddress] = useState('Scanning...');
  const [updateCount, setUpdateCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const trackingIdRef = useRef<string>('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const trackerReadyRef = useRef(false);

  // Generate or retrieve a session tracking ID for this standalone tracker
  useEffect(() => {
    // Use sessionStorage so each tab/session gets its own ID (works in incognito too)
    let id = '';
    try {
      id = sessionStorage.getItem('standalone_tracker_id') || '';
    } catch {
      // sessionStorage may be unavailable
    }
    if (!id) {
      id = generateTrackingId();
      try {
        sessionStorage.setItem('standalone_tracker_id', id);
      } catch {
        // sessionStorage may be unavailable in some environments
      }
    }
    trackingIdRef.current = id;
  }, []);

  const saveLocationToFirebase = useCallback(async (data: LocationData) => {
    const trackingId = trackingIdRef.current;
    if (!trackingId) return;

    try {
      if (!trackerReadyRef.current) {
        await getOrCreateTrackerAsync(trackingId);
        trackerReadyRef.current = true;
      }
      const success = await addLocationToTrackerAsync(trackingId, data);
      if (success) {
        setUpdateCount((prev) => prev + 1);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Error syncing location to Firebase:', error);
    }
  }, []);

  const fetchLocation = useCallback(async (isAutoUpdate = false) => {
    if (!isAutoUpdate) {
      setStatus('loading');
      setStatusMessage('Acquiring target coordinates...');
    }

    try {
      const position = await getCurrentPosition();
      const device = getDeviceInfo();
      const ip = await getIPAddress();

      const data: LocationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: new Date(position.timestamp).toISOString(),
        deviceInfo: device,
        ip,
      };

      setLocationData(data);
      setDeviceInfo(device);
      setIpAddress(ip);
      setStatus('success');
      setStatusMessage('Target location acquired');

      lastFetchTimeRef.current = Date.now();

      // Sync to Firebase
      await saveLocationToFirebase(data);
    } catch (error) {
      if (error instanceof GeolocationPositionError) {
        setStatusMessage(getGeolocationErrorMessage(error));
      } else if (error instanceof Error) {
        setStatusMessage(error.message);
      } else {
        setStatusMessage('Signal acquisition failed.');
      }
      setStatus('error');
    }
  }, [saveLocationToFirebase]);

  useEffect(() => {
    const device = getDeviceInfo();
    setDeviceInfo(device);
    getIPAddress().then(setIpAddress);
    fetchLocation();

    // Handle mobile browsers where setInterval is throttled/paused
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastFetchTimeRef.current;
        if (elapsed >= 15000) {
          fetchLocation(true);
        }
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        intervalRef.current = setInterval(() => {
          fetchLocation(true);
        }, 15000);
      }
    };

    // Set up 15-second auto-update interval
    intervalRef.current = setInterval(() => {
      fetchLocation(true);
    }, 15000);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchLocation]);

  const mapUrl = locationData
    ? `https://maps.google.com/maps?q=${locationData.latitude},${locationData.longitude}&z=15&output=embed`
    : '';

  return (
    <div className={styles.gradientBg}>
      <div className={styles.container}>
        <h1>🎯 Cyber Tracker</h1>
        <p className={styles.subtitle}>Standalone surveillance module</p>

        <div className={styles.trackerInfo}>
          <p>📡 Location data is being synced to Firebase</p>
          {updateCount > 0 && (
            <p>✓ {updateCount} location update{updateCount !== 1 ? 's' : ''} synced
              {lastUpdate && ` • Last: ${lastUpdate.toLocaleTimeString()}`}
            </p>
          )}
        </div>

        <div className={`status ${status}`}>
          {status === 'loading' && <div className="spinner"></div>}
          {status === 'success' && '✓ '}
          {status === 'error' && '✗ '}
          {statusMessage}
        </div>

        {locationData && (
          <div className={styles.locationInfo}>
            <div className="info-grid">
              <div className="info-card">
                <div className="info-label">Latitude</div>
                <div className="info-value">{locationData.latitude.toFixed(6)}</div>
              </div>
              <div className="info-card">
                <div className="info-label">Longitude</div>
                <div className="info-value">{locationData.longitude.toFixed(6)}</div>
              </div>
              <div className="info-card">
                <div className="info-label">Accuracy</div>
                <div className="info-value">±{locationData.accuracy.toFixed(2)}m</div>
              </div>
              <div className="info-card">
                <div className="info-label">Timestamp</div>
                <div className="info-value">
                  {new Date(locationData.timestamp).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="map-container">
              <iframe
                src={mapUrl}
                allowFullScreen
                loading="lazy"
                title="Location Map"
              ></iframe>
            </div>

            <button className="btn btn-rounded" onClick={() => fetchLocation()}>
              🔄 Refresh Coordinates
            </button>

            {deviceInfo && (
              <div className="device-info">
                <h3>📱 Device Intel</h3>
                <div className="device-details">
                  <div className="device-item">
                    <span className="device-label">Browser:</span>
                    <span className="device-value">{deviceInfo.browser}</span>
                  </div>
                  <div className="device-item">
                    <span className="device-label">Operating System:</span>
                    <span className="device-value">{deviceInfo.os}</span>
                  </div>
                  <div className="device-item">
                    <span className="device-label">Platform:</span>
                    <span className="device-value">{deviceInfo.platform}</span>
                  </div>
                  <div className="device-item">
                    <span className="device-label">Screen Resolution:</span>
                    <span className="device-value">{deviceInfo.screen}</span>
                  </div>
                  <div className="device-item">
                    <span className="device-label">IP Address:</span>
                    <span className="device-value">{ipAddress}</span>
                  </div>
                  <div className="device-item">
                    <span className="device-label">User Agent:</span>
                    <span
                      className="device-value"
                      style={{ fontSize: '10px', wordBreak: 'break-all' }}
                    >
                      {deviceInfo.userAgent}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <Link href="/login" className={styles.backLink}>
          ← Return to Command Center
        </Link>
      </div>
    </div>
  );
}
