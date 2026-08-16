import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Shield, Camera, LayoutDashboard, LogOut } from "lucide-react";
import CaptureCamera from "./components/CaptureCamera";
import Login from "./components/Login";
import AdminDashboard from "./components/AdminDashboard";
import { ToastProvider } from "./components/ui/Toast";
import "./App.css";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" />;
}

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  return (
    <nav className="navbar">
      <Link className="navbar-brand" to="/">
        <Shield size={24} />
        <span>GateManager Pro</span>
      </Link>
      
      <div className="nav-links">
        <Link className={`nav-link ${location.pathname === "/" ? "active" : ""}`} to="/">
          <Camera size={18} /> Scan Gate
        </Link>
        {!token && (
          <Link className={`nav-link ${location.pathname === "/login" ? "active" : ""}`} to="/login">
            <LogOut size={18} /> Admin Login
          </Link>
        )}
        {token && (
          <>
            <Link className={`nav-link ${location.pathname === "/admin" ? "active" : ""}`} to="/admin">
              <LayoutDashboard size={18} /> Dashboard
            </Link>
            <div className="navbar-user">
              <div className="avatar">A</div>
              <button 
                onClick={handleLogout} 
                className="nav-link" 
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                title="Logout"
              >
                <LogOut size={18} color="var(--danger-color)" />
              </button>
            </div>
          </>
        )}
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Navigation />
        <div className="main-content">
          <Routes>
            <Route path="/" element={<CaptureCamera />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </BrowserRouter>
    </ToastProvider>
  );
}
