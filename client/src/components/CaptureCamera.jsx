import React, { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import { io } from "socket.io-client";
import { Camera, PauseCircle, PlayCircle, ScanLine, Activity } from "lucide-react";
import api from "../api/api";
import StatusPill from "./ui/StatusPill";
import { useToast } from "./ui/Toast";
import "./CaptureCamera.css";

const videoConstraints = {
  width: 1280,
  height: 720,
  facingMode: "environment",
};

const SOCKET_URL = process.env.REACT_APP_API_URL?.replace("/api", "") || "http://localhost:5000";

export default function CaptureCamera() {
  const webcamRef = useRef(null);
  const { addToast } = useToast();
  const [isScanning, setIsScanning] = useState(true);
  const [successOverlay, setSuccessOverlay] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [scanningText, setScanningText] = useState("Waiting for plate...");
  const [bracketState, setBracketState] = useState("waiting"); // "waiting", "reading", "success"
  
  const checkContrast = (videoEl) => {
    const canvas = document.createElement("canvas");
    const w = 300;
    const h = 100;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    
    const sx = (videoEl.videoWidth - w) / 2;
    const sy = (videoEl.videoHeight - h) / 2;
    ctx.drawImage(videoEl, sx, sy, w, h, 0, 0, w, h);
    
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    let sum = 0, sumSq = 0, count = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += gray;
      sumSq += gray * gray;
      count++;
    }
    
    const mean = sum / count;
    return (sumSq / count) - (mean * mean);
  };

  const scanFrame = useCallback(async () => {
    if (!isScanning || !webcamRef.current || !webcamRef.current.video) return;

    const videoEl = webcamRef.current.video;
    if (videoEl.readyState !== 4) return;

    const variance = checkContrast(videoEl);
    if (variance < 400) { // Low contrast = blank wall
      setScanningText("Waiting for plate...");
      setBracketState("waiting");
      return;
    }

    setBracketState("reading");
    setScanningText("Reading plate...");

    const image = webcamRef.current.getScreenshot();
    if (!image) return;

    try {
      const res = await api.post("/detect", { image });
      
      if (res.status === 202) {
        setScanningText("Reading plate...");
        return;
      }
      
      if (res.status === 201 && res.data.entry) {
        setBracketState("success");
        setScanningText("Plate localized!");
        const entry = res.data.entry;
        
        // Show success overlay
        setSuccessOverlay(entry);

        addToast({
          title: "Plate Detected",
          description: `${entry.plateNumber} logged as ${entry.status}`,
          type: "success"
        });

        // Hide overlay after a delay
        setTimeout(() => setSuccessOverlay(null), 2500);
      }
    } catch (err) {
      setBracketState("waiting");
      setScanningText("Waiting for plate...");
      
      if (!err.response) {
        setIsScanning(false);
        addToast({
          title: "Connection Error",
          description: "Backend server is offline! Please start the Node server.",
          type: "error"
        });
      } else if (err.response.status === 503) {
        setIsScanning(false);
        addToast({
          title: "Service Unavailable",
          description: "Python Localizer is offline! Start app.py in python-service.",
          type: "error"
        });
      } else if (err.response?.status !== 422 && err.response?.status !== 409) {
        console.error("Detection error:", err);
      }
    }
  }, [isScanning, addToast]);

  // Live WebSocket Updates
  useEffect(() => {
    const socket = io(SOCKET_URL);
    socket.on("new-entry", (newEntry) => {
      setRecentScans(prev => {
        if (prev.length > 0 && prev[0]._id === newEntry._id) return prev;
        const newScans = [newEntry, ...prev].slice(0, 8);
        return newScans;
      });
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    let intervalId;
    if (isScanning && !successOverlay) {
      intervalId = setInterval(scanFrame, 500);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isScanning, scanFrame, successOverlay]);

  const toggleScanning = () => {
    setIsScanning((prev) => !prev);
  };

  return (
    <div className="kiosk-container split-layout">
      {/* LEFT SIDE: Camera Feed */}
      <div className="camera-section">
        <div className="camera-view-wrapper">
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={videoConstraints}
            className="video-feed"
          />

          {/* HUD Overlays */}
          {isScanning && !successOverlay && (
            <div className={`scanning-hud ${bracketState}`}>
              <div className="scan-line"></div>
              <div className="scan-corners-container">
                <div className={`scan-corners ${bracketState}`}>
                  <span className="tl"></span>
                  <span className="tr"></span>
                  <span className="bl"></span>
                  <span className="br"></span>
                </div>
              </div>
              <div className="scan-status-badge">
                <Activity size={16} className="pulse-icon" />
                <span className="tracking-widest uppercase">{scanningText}</span>
              </div>
            </div>
          )}

          {successOverlay && (
            <div className="success-hud animate-hud-pop">
              <div className="success-hud-content glass-panel">
                <ScanLine size={40} className="success-icon" />
                <h2 className="detected-plate-text">{successOverlay.plateNumber}</h2>
                <StatusPill status={successOverlay.status} />
              </div>
            </div>
          )}

          {!isScanning && (
            <div className="paused-hud">
              <div className="paused-hud-content glass-panel">
                <PauseCircle size={40} className="text-warning" />
                <h2>SYSTEM PAUSED</h2>
                <p>Scanner is currently offline</p>
              </div>
            </div>
          )}
          
          {/* Floating Control Button */}
          <div className="floating-controls">
            <button 
              className={`btn-hud-control ${!isScanning ? "btn-hud-active" : ""}`} 
              onClick={toggleScanning}
            >
              {isScanning ? (
                <><PauseCircle size={20} /> Pause Scanner</>
              ) : (
                <><PlayCircle size={20} /> Resume Scanner</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: Live Activity Feed */}
      <div className="activity-sidebar glass-panel">
        <div className="sidebar-header">
          <Camera size={18} className="text-primary" />
          <span>LIVE ACTIVITY LOG</span>
        </div>
        <div className="sidebar-list">
          {recentScans.length === 0 ? (
            <div className="no-activity">
              <div className="empty-state-dots">
                <span></span><span></span><span></span>
              </div>
              <p>Awaiting detections...</p>
            </div>
          ) : (
            recentScans.map((scan, idx) => (
              <div key={scan._id || Math.random()} 
                   className="activity-card animate-slide-left"
                   style={{ animationDelay: `${idx * 0.05}s` }}>
                <div className="activity-card-left">
                  <span className="activity-plate">{scan.plateNumber}</span>
                  <span className="activity-time">
                    {new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div className="activity-card-right">
                  <StatusPill status={scan.status} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
