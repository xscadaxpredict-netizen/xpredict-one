import React, { useState } from 'react';
import { Search, MapPin, Phone, MessageSquare, ChevronDown, ChevronUp, FileText, ArrowLeftCircle, PlusCircle } from 'lucide-react';
import { QuoteModal, FollowupModal } from '../followups';

export default function ConfirmedOrders({ enquiries, setEnquiries }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRowId, setExpandedRowId] = useState(null);
  
  // Quote Modal State
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [selectedEnquiryForQuote, setSelectedEnquiryForQuote] = useState(null);
  const [viewingQuoteData, setViewingQuoteData] = useState(null);

  // Followup Modal State
  const [isFollowupModalOpen, setIsFollowupModalOpen] = useState(false);
  const [activeEnquiryId, setActiveEnquiryId] = useState(null);

  const confirmedOrders = enquiries.filter(e => e.status === 'CONFIRMED' && (
    e.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (e.ocNumber && e.ocNumber.toLowerCase().includes(searchTerm.toLowerCase()))
  ));

  const toggleRow = (id) => { setExpandedRowId(expandedRowId === id ? null : id); };

  const handleUnconfirm = (enquiryId) => {
    setEnquiries(enquiries.map(enq => {
      if (enq.id === enquiryId) {
        const { ocNumber, confirmedQuoteId, ...rest } = enq;
        return { ...rest, status: 'PENDING' };
      }
      return enq;
    }));
  };

  const handleViewQuote = (enquiry, quote) => {
    setSelectedEnquiryForQuote(enquiry);
    setViewingQuoteData(quote);
    setIsQuoteModalOpen(true);
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Confirmed Orders</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>Manage all your successfully confirmed orders and view their Order Confirmation (OC) Numbers.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search by name or OC No..." 
              className="form-control search-box"
              style={{ paddingLeft: '2.25rem', width: '220px', borderRadius: '999px', fontSize: '0.85rem' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Contact</th>
              <th>Confirmed Quote</th>
              <th>OC Number</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {confirmedOrders.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No confirmed orders found. Confirm a quote in the Followups tab to see it here!
                </td>
              </tr>
            ) : (
              confirmedOrders.map((order) => {
                const confirmedQuote = order.quotes?.find(q => q.id === order.confirmedQuoteId);
                
                return (
                  <React.Fragment key={order.id}>
                    <tr className={`table-row ${expandedRowId === order.id ? 'expanded' : ''}`} onClick={() => toggleRow(order.id)} style={{ cursor: 'pointer' }}>
                      <td className="td-name">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {order.customerName}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '0.1rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Phone size={11} /> {order.phone}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{order.contactPerson}</td>
                      <td>
                        {confirmedQuote ? (
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: '0.15rem' }}>
                              {confirmedQuote.title}
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                              ₹ {confirmedQuote.amount.toLocaleString('en-IN')}
                            </div>
                            <button className="btn btn-small" style={{ fontSize: '0.75rem', padding: '0.3rem 0.8rem', background: '#3B82F6', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleViewQuote(order, confirmedQuote); }}>
                              View Quote
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <FileText size={14} color="var(--primary)" />
                          <span style={{ fontWeight: 700, color: 'var(--primary)', letterSpacing: '0.02em' }}>
                            {order.ocNumber || 'Pending'}
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button className="btn btn-primary btn-small" onClick={(e) => { e.stopPropagation(); setActiveEnquiryId(order.id); setIsFollowupModalOpen(true); }}>
                            <PlusCircle size={14} style={{ marginRight: '0.25rem' }} /> Follow-up
                          </button>
                          <button className="btn btn-secondary btn-small" onClick={(e) => { e.stopPropagation(); handleUnconfirm(order.id); }}>
                            <ArrowLeftCircle size={14} style={{ marginRight: '0.25rem' }} /> Unconfirm
                          </button>
                          <button className="expand-btn" style={{ marginLeft: '0.25rem', padding: '0.35rem' }}>
                            {expandedRowId === order.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Details */}
                    {expandedRowId === order.id && (
                      <tr>
                        <td colSpan="5" style={{ padding: 0 }}>
                          <div className="expanded-content">
                            <div className="detail-grid">
                              {/* Left: Enquiry Info */}
                              <div>
                                <div className="detail-section-title">Order Details</div>
                                <div className="info-row">
                                  <MapPin className="info-icon" size={15} />
                                  <span>{order.address}</span>
                                </div>
                                <div className="info-row">
                                  <MessageSquare className="info-icon" size={15} />
                                  <span>{order.remarks}</span>
                                </div>
                              </div>
                              
                              {/* Right: Follow-ups */}
                              <div>
                                <div className="detail-section-title">Past Follow-up History</div>
                                {order.followups.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                    <div className="latest-followup">
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                        <span className="followup-date">Due: {order.followups[0].date}</span>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Added {order.followups[0].enteredDate}</span>
                                      </div>
                                      <p className="followup-text">{order.followups[0].remarks}</p>
                                    </div>
                                  </div>
                                ) : (
                                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No follow-ups.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <QuoteModal 
        isOpen={isQuoteModalOpen} 
        onClose={() => setIsQuoteModalOpen(false)} 
        enquiry={selectedEnquiryForQuote}
        onSaveQuote={() => {}}
        initialData={viewingQuoteData}
      />
      
      <FollowupModal 
        isOpen={isFollowupModalOpen} 
        onClose={() => setIsFollowupModalOpen(false)}
        onAddFollowup={(followup) => {
          const today = new Date().toISOString().split('T')[0];
          const newFw = { id: Date.now(), date: followup.nextDate, enteredDate: today, remarks: followup.remarks };
          setEnquiries(enquiries.map(enq => {
            if (enq.id === activeEnquiryId) return { ...enq, followups: [newFw, ...enq.followups] };
            return enq;
          }));
          setIsFollowupModalOpen(false);
        }}
      />
    </div>
  );
}
