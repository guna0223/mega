import React from 'react';
import { ArrowRightCircle, ArrowLeftCircle } from 'lucide-react';
import './StatusPill.css';

export default function StatusPill({ status }) {
  const isOut = status.toUpperCase() === 'OUT';
  const Icon = isOut ? ArrowLeftCircle : ArrowRightCircle;
  
  return (
    <span className={`status-pill ${isOut ? 'pill-out' : 'pill-in'}`}>
      <Icon size={14} />
      <span>{status.toUpperCase()}</span>
    </span>
  );
}
