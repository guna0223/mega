import React, { useEffect, useState, useMemo } from "react";
import { io } from "socket.io-client";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { 
  Bus, MapPin, Activity, Search, Filter, ChevronLeft, ChevronRight, Image as ImageIcon, X, AlertTriangle, Check, Download, Trash2
} from "lucide-react";
import api from "../api/api";
import StatusPill from "./ui/StatusPill";
import { useToast } from "./ui/Toast";
import LoadingSkeleton from "./ui/LoadingSkeleton";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import "./AdminDashboard.css";

const SOCKET_URL = process.env.REACT_APP_API_URL?.replace("/api", "") || "http://localhost:5000";

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function AdminDashboard() {
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Tabs
  const [activeTab, setActiveTab] = useState("matched"); // "matched" = Bus Status | "unmatched" = raw OCR misses

  // Filters
  const [plateFilter, setPlateFilter] = useState("");
  const debouncedPlateFilter = useDebounce(plateFilter, 500);
  const [statusFilter, setStatusFilter] = useState("");
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Modals
  const [selectedImage, setSelectedImage] = useState(null);
  
  // Assign Modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [entryToAssign, setEntryToAssign] = useState(null);
  const [registeredBuses, setRegisteredBuses] = useState([]);
  const [assignPlateNumber, setAssignPlateNumber] = useState("");
  const [assignRouteName, setAssignRouteName] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  const { addToast } = useToast();

  const fetchEntries = async () => {
    setIsLoading(true);
    try {
      if (activeTab === "matched") {
        // Bus Status view: every registered bus + its current IN/OUT status
        const params = {};
        if (debouncedPlateFilter) params.plateNumber = debouncedPlateFilter;
        if (statusFilter) params.status = statusFilter;

        const res = await api.get("/buses/status", { params });
        setEntries(res.data.buses);
      } else {
        // Unmatched Reads view: raw OCR misses
        const params = { matchedBus: false };
        if (debouncedPlateFilter) params.plateNumber = debouncedPlateFilter;

        const res = await api.get("/entries", { params });
        setEntries(res.data.entries);
      }
      setCurrentPage(1);
    } catch (error) {
      console.error("Fetch entries error:", error);
      const errMsg = error.response?.data?.message || error.message || "Error fetching data";
      addToast({ title: "Fetch Error", description: errMsg, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.get("/entries/stats");
      setStats(res.data);
    } catch (error) {
      console.error("Stats error", error);
    }
  };

  const fetchRegisteredBuses = async () => {
    try {
      const res = await api.get("/buses");
      setRegisteredBuses(res.data);
    } catch (error) {
      console.error("Error fetching buses", error);
    }
  };

  // Trigger a refetch instead of calling stale fetchEntries
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPlateFilter, statusFilter, activeTab, refetchTrigger]);

  useEffect(() => {
    fetchStats();
    fetchRegisteredBuses();

    const socket = io(SOCKET_URL);
    socket.on("new-entry", (newEntry) => {
      setRefetchTrigger(prev => prev + 1); // Refresh table
      if (newEntry && newEntry.matchedBus) {
         fetchStats();
         addToast({
           title: "New Bus Detected",
           description: `Plate ${newEntry.plateNumber} marked as ${newEntry.status}`,
           type: "info"
         });
      } else if (newEntry && !newEntry.matchedBus) {
         addToast({
           title: "Unmatched Plate Detected",
           description: `Failed to match OCR: ${newEntry.rawOcrText}`,
           type: "error"
         });
      }
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAssignClick = (entry) => {
    setEntryToAssign(entry);
    setAssignPlateNumber(entry.rawOcrText || entry.plateNumber || "");
    setAssignRouteName("");
    setAssignModalOpen(true);
  };

  const submitAssign = async () => {
    if (!assignPlateNumber) return;
    setIsAssigning(true);
    try {
      await api.put(`/entries/${entryToAssign._id}/assign`, {
        plateNumber: assignPlateNumber,
        routeName: assignRouteName
      });
      addToast({ title: "Successfully assigned plate", type: "success" });
      setAssignModalOpen(false);
      fetchEntries();
      fetchStats();
    } catch (err) {
      addToast({ title: "Failed to assign", type: "error" });
    } finally {
      setIsAssigning(false);
    }
  };

  const downloadLastMonthData = async () => {
    try {
      const res = await api.get("/entries/export-last-month");
      const data = res.data.entries;
      if (!data || data.length === 0) {
        addToast({ title: "No data found", description: "No entries in the last 1 month.", type: "info" });
        return;
      }

      const doc = new jsPDF();
      doc.text("Bus Gate Entries - Last 1 Month", 14, 15);
      
      const tableColumn = ["Plate Number", "Status", "Date", "Time", "Matched Bus"];
      const tableRows = [];
      
      data.forEach(entry => {
        const date = new Date(entry.timestamp);
        const ticketData = [
          entry.plateNumber,
          entry.status,
          date.toLocaleDateString(),
          date.toLocaleTimeString(),
          entry.matchedBus ? "Yes" : "No"
        ];
        tableRows.push(ticketData);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 20,
      });

      doc.save("BusGate_Entries_LastMonth.pdf");
      addToast({ title: "PDF downloaded successfully", type: "success" });
    } catch (error) {
      console.error(error);
      addToast({ title: "Export Failed", description: "Failed to generate PDF.", type: "error" });
    }
  };

  const deleteLastMonthData = async () => {
    if (!window.confirm("Are you sure you want to delete all entries older than 1 month? This action cannot be undone.")) return;
    try {
      const res = await api.delete("/entries/delete-last-month");
      addToast({ title: "Success", description: res.data.message || "Data deleted successfully", type: "success" });
      fetchEntries();
      fetchStats();
    } catch (error) {
      console.error(error);
      addToast({ title: "Delete Failed", description: "Failed to delete data.", type: "error" });
    }
  };

  // Pagination Logic
  const totalPages = Math.ceil(entries.length / itemsPerPage);
  const currentEntries = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return entries.slice(start, start + itemsPerPage);
  }, [entries, currentPage]);

  const chartData = [
    { name: 'IN', value: stats?.busesCurrentlyIn || 0, color: 'var(--success-color)' },
    { name: 'OUT', value: Math.max(0, (stats?.totalEntriesToday || 0) - (stats?.busesCurrentlyIn || 0)), color: 'var(--danger-color)' }
  ];

  return (
    <div className="dashboard-wrapper animate-fade-in">
      <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>System Overview</h2>
          <p className="subtitle">Real-time gate analytics and logs</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-primary" onClick={downloadLastMonthData} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Download size={16} /> Export (Last 1 Month)
          </button>
          <button className="btn-danger" onClick={deleteLastMonthData} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--danger-color)', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
            <Trash2 size={16} /> Delete Old Data
          </button>
        </div>
      </div>

      <div className="stats-grid">
        {stats ? (
          <>
            <StatCard 
              icon={<Bus size={24} />} 
              label="Buses Currently In" 
              value={stats.busesCurrentlyIn} 
            />
            <StatCard 
              icon={<MapPin size={24} />} 
              label="Total Known Buses" 
              value={stats.totalKnownBuses} 
            />
            <StatCard 
              icon={<Activity size={24} />} 
              label="Entries Today" 
              value={stats.totalEntriesToday} 
            />
          </>
        ) : (
          <>
            <LoadingSkeleton height="120px" borderRadius="var(--radius-lg)" />
            <LoadingSkeleton height="120px" borderRadius="var(--radius-lg)" />
            <LoadingSkeleton height="120px" borderRadius="var(--radius-lg)" />
          </>
        )}
      </div>

      <div className="content-grid">
        <div className="table-card card">
          <div className="card-header">
            <div className="tabs">
              <button 
                className={`tab-btn ${activeTab === 'matched' ? 'active' : ''}`}
                onClick={() => setActiveTab('matched')}
              >
                Bus Status
              </button>
              <button 
                className={`tab-btn ${activeTab === 'unmatched' ? 'active' : ''}`}
                onClick={() => setActiveTab('unmatched')}
              >
                Unmatched Reads
              </button>
            </div>
            
            <div className="filter-bar">
              <div className="search-input">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search plates..."
                  value={plateFilter}
                  onChange={(e) => setPlateFilter(e.target.value)}
                />
              </div>
              {activeTab === "matched" && (
                <div className="select-input">
                  <Filter size={16} />
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="">All Status</option>
                    <option value="IN">IN</option>
                    <option value="OUT">OUT</option>
                  </select>
                </div>
              )}
            </div>
          </div>
          
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Plate Number</th>
                  {activeTab === 'matched' && <th>Route</th>}
                  {activeTab === 'matched' ? <th>Status</th> : <th>Issue</th>}
                  <th>{activeTab === 'matched' ? 'Last Seen' : 'Time'}</th>
                  <th>Confidence</th>
                  {activeTab === 'unmatched' && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td><LoadingSkeleton width="40px" height="30px" /></td>
                      <td><LoadingSkeleton width="100px" height="20px" /></td>
                      {activeTab === 'matched' && <td><LoadingSkeleton width="80px" height="20px" /></td>}
                      <td><LoadingSkeleton width="60px" height="24px" borderRadius="12px" /></td>
                      <td><LoadingSkeleton width="120px" height="20px" /></td>
                      <td><LoadingSkeleton width="40px" height="20px" /></td>
                      {activeTab === 'unmatched' && <td><LoadingSkeleton width="60px" height="24px" /></td>}
                    </tr>
                  ))
                ) : currentEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty-state">
                      <div className="empty-state-content">
                        {activeTab === 'matched' ? (
                          <><Search size={48} /> <h4>No buses found</h4></>
                        ) : (
                          <><Check size={48} className="text-success" /> <h4>All caught up!</h4><p>No unmatched reads.</p></>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  currentEntries.map((e) => {
                    const timeValue = activeTab === 'matched' ? e.lastSeen : e.timestamp;
                    return (
                      <tr key={e._id}>
                        <td>
                          <button 
                            className="thumb-btn" 
                            onClick={() => setSelectedImage(e.image || e.imageUrl)}
                            disabled={!e.image && !e.imageUrl}
                            title={e.image || e.imageUrl ? "View Image" : "No image available"}
                          >
                            {(e.image || e.imageUrl) ? (
                              <img src={e.image || e.imageUrl} alt="Plate" className="mini-thumb" />
                            ) : (
                              <div className="mini-thumb fallback"><ImageIcon size={16}/></div>
                            )}
                          </button>
                        </td>
                        <td>
                          <span className="font-mono plate-text">{activeTab === 'matched' ? e.plateNumber : (e.rawOcrText || e.plateNumber)}</span>
                        </td>
                        {activeTab === 'matched' && (
                          <td>
                            {e.routeName ? e.routeName : <span className="na-text">N/A</span>}
                          </td>
                        )}
                        <td>
                          {activeTab === 'matched' ? (
                            <StatusPill status={e.status} />
                          ) : (
                            <span className="unmatched-badge"><AlertTriangle size={14}/> Not Registered</span>
                          )}
                        </td>
                        <td>
                          {timeValue ? (
                            <div className="time-cell">
                              <span className="time-date">
                                {new Date(timeValue).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                              <span className="time-time">
                                {new Date(timeValue).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ) : (
                            <span className="na-text">Never scanned</span>
                          )}
                        </td>
                        <td>
                          {e.detectedConfidence ? (
                            <div className="confidence-bar-wrap">
                              <div className="confidence-track">
                                <div 
                                  className="confidence-fill" 
                                  style={{ 
                                    width: `${e.detectedConfidence}%`,
                                    background: e.detectedConfidence > 80 ? 'var(--success-color)' : 'var(--warning-color)'
                                  }}
                                ></div>
                              </div>
                              <span className="confidence-text">{Math.round(e.detectedConfidence)}%</span>
                            </div>
                          ) : (
                            <span className="na-text">N/A</span>
                          )}
                        </td>
                        {activeTab === 'unmatched' && (
                          <td>
                            <button className="btn-assign" onClick={() => handleAssignClick(e)}>
                              Assign
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && entries.length > 0 && (
            <div className="pagination">
              <span className="page-info">
                Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, entries.length)} of {entries.length}
              </span>
              <div className="page-controls">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                  <ChevronLeft size={18} />
                </button>
                <span className="current-page">{currentPage}</span>
                <button disabled={currentPage === totalPages || totalPages === 0} onClick={() => setCurrentPage(p => p + 1)}>
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="chart-card card">
          <div className="card-header">
            <h3>Today's Traffic</h3>
          </div>
          <div className="chart-container">
            {stats ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{fill: 'var(--text-secondary)'}} />
                  <YAxis stroke="var(--text-secondary)" tick={{fill: 'var(--text-secondary)'}} allowDecimals={false} />
                  <Tooltip cursor={{fill: 'var(--surface-hover)'}} contentStyle={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--surface-border)', borderRadius: '8px' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <LoadingSkeleton height="100%" borderRadius="var(--radius-md)" />
            )}
          </div>
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div className="modal-backdrop" onClick={() => setSelectedImage(null)}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedImage(null)}>
              <X size={24} />
            </button>
            <img src={selectedImage} alt="Captured scan" className="modal-image" />
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assignModalOpen && entryToAssign && (
        <div className="modal-backdrop" onClick={() => setAssignModalOpen(false)}>
          <div className="assign-modal animate-fade-in" onClick={e => e.stopPropagation()}>
            <h3>Assign Unmatched Read</h3>
            <p className="assign-desc">
              Camera saw: <span className="font-mono plate-text">{entryToAssign.rawOcrText || entryToAssign.plateNumber}</span>
            </p>
            
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label>Plate Number</label>
              <input 
                type="text"
                className="form-input" 
                value={assignPlateNumber} 
                onChange={e => setAssignPlateNumber(e.target.value)}
                placeholder="e.g. TN3815131"
              />
            </div>
            
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label>Route Name (Optional)</label>
              <input 
                type="text"
                className="form-input" 
                value={assignRouteName} 
                onChange={e => setAssignRouteName(e.target.value)}
                placeholder="e.g. Campus Route 1"
              />
            </div>
            
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setAssignModalOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={!assignPlateNumber || isAssigning} onClick={submitAssign}>
                {isAssigning ? "Assigning..." : "Assign & Log"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div className="stat-card card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-info">
        <div className="stat-label">{label}</div>
        <div className="stat-value font-mono">{value}</div>
      </div>
    </div>
  );
}