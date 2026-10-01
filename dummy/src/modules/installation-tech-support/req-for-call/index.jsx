import React, { useState } from 'react';
import { 
  PhoneCall, 
  Search, 
  PlusCircle, 
  Clock, 
  CheckCircle2, 
  Phone, 
  X, 
  User, 
  Building2, 
  Edit2,
  Check,
  RotateCcw
} from 'lucide-react';

export const initialCallRequests = [
  {
    id: 'RFC-101',
    customerName: 'TechCorp Solutions',
    contactName: 'Sarah Jenkins',
    contactNumber: '+1 (555) 123-4567',
    query: 'Need guidance regarding 1000 LPH RO machine installation and electrical wiring.',
    status: 'Pending',
    createdAt: '25 Sep 2026, 11:30 AM'
  },
  {
    id: 'RFC-102',
    customerName: 'Global Industries',
    contactName: 'Mike Ross',
    contactNumber: '+1 (555) 987-6543',
    query: 'Water softener multiport valve regeneration query - hardness reading is high after recharge.',
    status: 'Pending',
    createdAt: '25 Sep 2026, 09:15 AM'
  },
  {
    id: 'RFC-103',
    customerName: 'Sri Lakshmi Industries',
    contactName: 'Kishore Kumar',
    contactNumber: '+91 98451 22340',
    query: 'Requesting clarification on daily maintenance log sheet and membrane replacement interval.',
    status: 'Resolved',
    createdAt: '24 Sep 2026, 03:45 PM'
  }
];

export default function ReqForCallDashboard({ 
  enquiries = [], 
  requests: propRequests, 
  setRequests: propSetRequests 
}) {
  const [localRequests, setLocalRequests] = useState(initialCallRequests);
  const requests = propRequests !== undefined ? propRequests : localRequests;
  const setRequests = propSetRequests !== undefined ? propSetRequests : setLocalRequests;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modals & Feedback
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [successToast, setSuccessToast] = useState(null);
  const [phoneError, setPhoneError] = useState('');

  // Form State: strictly the 4 fields
  const [formData, setFormData] = useState({
    customerName: '',
    contactName: '',
    contactNumber: '',
    query: ''
  });

  // Compile list of available customers/dealers from DMS records
  const defaultDmsCustomers = [
    { name: 'TechCorp Solutions', contactPerson: 'Sarah Jenkins', phone: '+1 (555) 123-4567' },
    { name: 'Global Industries', contactPerson: 'Mike Ross', phone: '+1 (555) 987-6543' },
    { name: 'Sri Lakshmi Industries', contactPerson: 'Kishore Kumar', phone: '+91 98451 22340' },
    { name: 'Apex Beverages Ltd', contactPerson: 'Ramesh Sharma', phone: '+91 97412 88901' },
    { name: 'Greenfield Pharma Lab', contactPerson: 'Dr. Ananya Rao', phone: '+91 99002 45671' },
    { name: 'Deccan Textiles Pvt Ltd', contactPerson: 'Venkatesh Murthy', phone: '+91 94481 67890' }
  ];

  // Merge with any enquiries dynamically passed from DMS
  const combinedCustomersMap = new Map();
  defaultDmsCustomers.forEach(c => combinedCustomersMap.set(c.name, c));
  if (enquiries && enquiries.length > 0) {
    enquiries.forEach(e => {
      if (e.customerName) {
        combinedCustomersMap.set(e.customerName, {
          name: e.customerName,
          contactPerson: e.contactPerson || '',
          phone: e.phone || ''
        });
      }
    });
  }
  const dmsCustomerList = Array.from(combinedCustomersMap.values());

  // Handle Customer Selection: Auto-populate contact name and phone from record
  const handleCustomerSelect = (customerName) => {
    const found = dmsCustomerList.find(c => c.name === customerName);
    if (found) {
      setFormData(prev => ({
        ...prev,
        customerName: found.name,
        contactName: found.contactPerson || prev.contactName,
        contactNumber: found.phone || prev.contactNumber
      }));
      setPhoneError('');
    } else {
      setFormData(prev => ({ ...prev, customerName }));
    }
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({
      customerName: '',
      contactName: '',
      contactNumber: '',
      query: ''
    });
    setPhoneError('');
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (req) => {
    setEditingId(req.id);
    setFormData({
      customerName: req.customerName,
      contactName: req.contactName,
      contactNumber: req.contactNumber,
      query: req.query
    });
    setPhoneError('');
    setIsModalOpen(true);
  };

  // Phone Validation (min 10 digits)
  const validatePhoneNumber = (phone) => {
    const digitsOnly = phone.replace(/[^0-9]/g, '');
    return digitsOnly.length >= 10;
  };

  // Submit Handler (Create or Edit)
  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.customerName) return;

    if (!validatePhoneNumber(formData.contactNumber)) {
      setPhoneError('Please enter a valid phone number (min 10 digits).');
      return;
    }
    setPhoneError('');

    if (editingId) {
      // Update existing record
      setRequests(requests.map(r => r.id === editingId ? {
        ...r,
        customerName: formData.customerName,
        contactName: formData.contactName,
        contactNumber: formData.contactNumber,
        query: formData.query
      } : r));

      setIsModalOpen(false);
      setSuccessToast(`Request #${editingId} updated successfully.`);
    } else {
      // Create new record with auto ID, date, and status = "Pending"
      const newId = `RFC-${String(requests.length + 101).padStart(3, '0')}`;
      const now = new Date();
      const formattedDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + 
        ', ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

      const newRequest = {
        id: newId,
        customerName: formData.customerName,
        contactName: formData.contactName,
        contactNumber: formData.contactNumber,
        query: formData.query,
        status: 'Pending',
        createdAt: formattedDate
      };

      setRequests([newRequest, ...requests]);
      setIsModalOpen(false);
      setSuccessToast(`Request #${newId} created successfully! Status is Pending.`);
    }

    setTimeout(() => {
      setSuccessToast(null);
    }, 3500);
  };

  // Toggle Status: Pending <-> Resolved
  const toggleStatus = (id, currentStatus) => {
    const nextStatus = currentStatus === 'Pending' ? 'Resolved' : 'Pending';
    setRequests(requests.map(r => r.id === id ? { ...r, status: nextStatus } : r));
    setSuccessToast(`Request #${id} marked as ${nextStatus}.`);
    setTimeout(() => {
      setSuccessToast(null);
    }, 2500);
  };

  // Filter requests
  const filteredRequests = requests.filter(req => {
    const matchesStatus = statusFilter === 'All' || req.status === statusFilter;
    const matchesSearch = 
      req.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.contactName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.contactNumber.includes(searchTerm) ||
      req.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.query.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Counts
  const totalCount = requests.length;
  const pendingCount = requests.filter(r => r.status === 'Pending').length;
  const resolvedCount = requests.filter(r => r.status === 'Resolved').length;

  return (
    <div style={{ maxWidth: '1100px' }}>
      {/* Toast Notification */}
      {successToast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: 'var(--accent-dark)',
          color: '#FFFFFF',
          padding: '0.85rem 1.25rem',
          borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          zIndex: 1500,
          fontSize: '0.88rem',
          fontWeight: 500,
          borderLeft: '4px solid var(--success)'
        }}>
          <CheckCircle2 size={18} color="var(--success)" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.9rem 1.1rem', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Requests</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.15rem' }}>{totalCount}</div>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.9rem 1.1rem', boxShadow: 'var(--shadow-card)', borderLeft: '4px solid #F59E0B' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pending Calls</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#B45309', marginTop: '0.15rem' }}>{pendingCount}</div>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.9rem 1.1rem', boxShadow: 'var(--shadow-card)', borderLeft: '4px solid #10B981' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Resolved</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#047857', marginTop: '0.15rem' }}>{resolvedCount}</div>
        </div>
      </div>

      {/* Search & Actions Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flex: 1 }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '280px' }}>
            <Search size={15} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search request, customer, phone..."
              className="form-control search-box"
              style={{ paddingLeft: '2.4rem', borderRadius: '999px', fontSize: '0.82rem' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filter chips */}
          <div className="filter-chips-wrapper" style={{ margin: 0, padding: 0 }}>
            {['All', 'Pending', 'Resolved'].map(st => (
              <button
                key={st}
                className={`filter-chip ${statusFilter === st ? 'active' : ''}`}
                onClick={() => setStatusFilter(st)}
                style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <button className="btn btn-primary btn-small" onClick={handleOpenCreate}>
          <PlusCircle size={15} /> Request a Call
        </button>
      </div>

      {/* Requests Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '85px', padding: '0.75rem 1rem' }}>Req ID</th>
              <th style={{ minWidth: '180px', padding: '0.75rem 1rem' }}>Customer & Contact</th>
              <th style={{ minWidth: '220px', maxWidth: '320px', padding: '0.75rem 1rem' }}>Query</th>
              <th style={{ width: '140px', padding: '0.75rem 1rem' }}>Status & Date</th>
              <th style={{ textAlign: 'right', width: '180px', padding: '0.75rem 1rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                  <PhoneCall size={32} style={{ margin: '0 auto 0.5rem auto', opacity: 0.4 }} />
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem', fontSize: '0.9rem' }}>No Call Requests Found</div>
                  <div style={{ fontSize: '0.8rem' }}>Click "Request a Call" above to submit a new callback inquiry.</div>
                </td>
              </tr>
            ) : (
              filteredRequests.map((req) => (
                <tr key={req.id} className="table-row">
                  {/* Request ID */}
                  <td style={{ fontWeight: 700, color: 'var(--accent-color)', fontSize: '0.85rem', whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>
                    #{req.id}
                  </td>

                  {/* Customer & Contact */}
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.88rem' }}>
                      <Building2 size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      <span>{req.customerName}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span>{req.contactName}</span>
                      <span>•</span>
                      <a 
                        href={`tel:${req.contactNumber.replace(/[^0-9+]/g, '')}`} 
                        style={{ color: 'var(--accent-color)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                        title="Click to dial"
                      >
                        <Phone size={11} /> {req.contactNumber}
                      </a>
                    </div>
                  </td>

                  {/* Query */}
                  <td style={{ maxWidth: '320px', padding: '0.75rem 1rem' }}>
                    <div 
                      style={{ 
                        fontSize: '0.82rem', 
                        color: 'var(--text-secondary)', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        lineHeight: 1.4
                      }}
                      title={req.query}
                    >
                      {req.query}
                    </div>
                  </td>

                  {/* Status & Date */}
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div>
                      {req.status === 'Pending' ? (
                        <span className="badge-status-pending" style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}>
                          <Clock size={11} /> Pending
                        </span>
                      ) : (
                        <span className="badge-status-resolved" style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}>
                          <CheckCircle2 size={11} /> Resolved
                        </span>
                      )}
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem', whiteSpace: 'nowrap' }}>
                        {req.createdAt}
                      </div>
                    </div>
                  </td>

                  {/* Clean Actions: Call, Edit & Status Toggle */}
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'inline-flex', gap: '0.35rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                      {/* Direct Call Button */}
                      <a 
                        href={`tel:${req.contactNumber.replace(/[^0-9+]/g, '')}`} 
                        className="btn btn-primary btn-small"
                        style={{ textDecoration: 'none', background: '#3B82F6', border: 'none', color: '#FFFFFF', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        title={`Call ${req.contactName} (${req.contactNumber})`}
                      >
                        <Phone size={12} /> Call
                      </a>

                      {/* Edit Button */}
                      <button 
                        type="button"
                        className="btn btn-secondary btn-small"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => handleOpenEdit(req)}
                        title="Edit details"
                      >
                        <Edit2 size={12} /> Edit
                      </button>

                      {/* Status Toggle Action */}
                      {req.status === 'Pending' ? (
                        <button 
                          type="button"
                          className="btn btn-small"
                          style={{ background: 'var(--success)', color: '#FFFFFF', border: 'none', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => toggleStatus(req.id, 'Pending')}
                          title="Mark call as resolved"
                        >
                          <Check size={12} /> Resolve
                        </button>
                      ) : (
                        <button 
                          type="button"
                          className="btn btn-secondary btn-small"
                          style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem', opacity: 0.85 }}
                          onClick={() => toggleStatus(req.id, 'Resolved')}
                          title="Reopen as pending"
                        >
                          <RotateCcw size={11} /> Reopen
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* REQUEST A CALL / EDIT MODAL (Clean 4 fields only, no clutter) */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)} style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingId ? `Edit Request #${editingId}` : 'Request a Call'}
              </h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                {/* 1. Customer / Dealer Dropdown */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Customer / Dealer *
                  </label>
                  <select
                    required
                    className="form-control"
                    value={formData.customerName}
                    onChange={(e) => handleCustomerSelect(e.target.value)}
                  >
                    <option value="">-- Select Customer / Dealer --</option>
                    {dmsCustomerList.map(cust => (
                      <option key={cust.name} value={cust.name}>
                        {cust.name} {cust.contactPerson ? `(${cust.contactPerson})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Contact Name */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Contact Name *
                  </label>
                  <input
                    required
                    type="text"
                    className="form-control"
                    placeholder="Name of contact person"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  />
                </div>

                {/* 3. Contact Number */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Contact Number *
                  </label>
                  <input
                    required
                    type="tel"
                    className="form-control"
                    placeholder="Callback phone number"
                    value={formData.contactNumber}
                    onChange={(e) => {
                      setFormData({ ...formData, contactNumber: e.target.value });
                      if (phoneError) setPhoneError('');
                    }}
                  />
                  {phoneError && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.25rem', fontWeight: 600 }}>
                      {phoneError}
                    </div>
                  )}
                </div>

                {/* 4. Query */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Query *
                  </label>
                  <textarea
                    required
                    className="form-control"
                    rows={4}
                    placeholder="Describe reason for callback..."
                    value={formData.query}
                    onChange={(e) => setFormData({ ...formData, query: e.target.value })}
                  />
                </div>

              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingId ? 'Save Changes' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
