import React from 'react';
import './LoadingSkeleton.css';

export default function LoadingSkeleton({ width = '100%', height = '20px', borderRadius = 'var(--radius-sm)', className = '' }) {
  return (
    <div 
      className={`skeleton-pulse ${className}`} 
      style={{ width, height, borderRadius }} 
    />
  );
}
