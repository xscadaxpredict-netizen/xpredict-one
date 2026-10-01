import React, { useState } from 'react';
import { Plus, ShieldCheck, FileText, CheckCircle, ChevronDown, ChevronUp, MapPin, MessageSquare } from 'lucide-react';
import AMCQuoteModal from './AMCQuoteModal';

export default function AMCTab({ sites, updateSiteData }) {
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [formSiteId, setFormSiteId] = useState('');
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [editingQuoteData, setEditingQuoteData] = useState(null);

  const displaySites = selectedSiteId ? sites.filter(s => s.id.toString() === selectedSiteId) : sites;

  const handleOpenQuoteModal = (site = null, quoteData = null) => {
    if (site) {
      setFormSiteId(site.id.toString());
    } else {
      setFormSiteId(sites[0]?.id ? sites[0].id.toString() : '');
    }
    setEditingQuoteData(quoteData);
    setIsQuoteModalOpen(true);
  };

  const toggleRow = (id) => {
    setExpandedRowId(expandedRowId === id ? null : id);
  };

  const handleSaveQuote = (siteId, quoteData) => {
    const site = sites.find(s => s.id === siteId);
    const existingQuotes = site?.siteData?.amcQuotes || [];
    updateSiteData(siteId, 'amcQuotes', [quoteData, ...existingQuotes]);
    setIsQuoteModalOpen(false);
  };

  const confirmQuote = (siteId, quoteId) => {
    if (!window.confirm('Are you sure you want to confirm this AMC quote? This will set it as the Active AMC for this site.')) return;

    const site = sites.find(s => s.id === siteId);
    const existingQuotes = site?.siteData?.amcQuotes || [];
    
    const updatedQuotes = existingQuotes.map(q => 
      q.id === quoteId ? { ...q, status: 'CONFIRMED' } : { ...q, status: q.status === 'CONFIRMED' ? 'REJECTED' : q.status }
    );
    
    updateSiteData(siteId, 'amcQuotes', updatedQuotes);
    updateSiteData(siteId, 'activeAmcId', quoteId);
  };

  const deleteQuote = (siteId, quoteId) => {
    if (!window.confirm('Are you sure you want to delete this quote? This action cannot be undone.')) return;

    const site = sites.find(s => s.id === siteId);
    const existingQuotes = site?.siteData?.amcQuotes || [];
    const updatedQuotes = existingQuotes.filter(q => q.id !== quoteId);
    
    updateSiteData(siteId, 'amcQuotes', updatedQuotes);
    if (site.siteData?.activeAmcId === quoteId) {
      updateSiteData(siteId, 'activeAmcId', null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          background: 'var(--bg-surface)', 
          padding: '1rem 1.25rem', 
          borderRadius: 'var(--radius-md)', 
          border: '1px solid var(--border-color)',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: '240px' }}>
          <select 
            className="form-control" 
            style={{ maxWidth: '300px' }} 
            value={selectedSiteId} 
            onChange={e => setSelectedSiteId(e.target.value)}
          >
            <option value="">All Deployed Sites ({sites.length})</option>
            {sites.map(s => (
               <option key={s.id} value={s.id}>
                 {s.customerName} ({s.ocNumber || 'No OC'})
               </option>
            ))}
          </select>
        </div>

        <button 
          className="btn btn-primary"
          onClick={() => handleOpenQuoteModal()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Plus size={16} /> Create AMC Quote
        </button>
      </div>

      <div className="table-container" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Machine (OC)</th>
              <th>Latest Quotation</th>
              <th>Active AMC</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {displaySites.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <ShieldCheck size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.3 }} />
                  <div style={{ fontWeight: 600 }}>No AMC records found</div>
                </td>
              </tr>
            ) : displaySites.map(site => {
              const quotes = site.siteData?.amcQuotes || [];
              const activeAmcId = site.siteData?.activeAmcId;
              const activeQuote = quotes.find(q => q.id === activeAmcId);
              
              return (
                <React.Fragment key={site.id}>
                  <tr className={`table-row ${expandedRowId === site.id ? 'expanded' : ''}`} onClick={() => toggleRow(site.id)} style={{ cursor: 'pointer' }}>
                    <td className="td-name">
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{site.customerName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{site.address || site.phone}</div>
                    </td>
                    <td>
                      <div style={{ color: 'var(--accent-color)', fontWeight: 600, fontSize: '0.85rem' }}>
                        {site.ocNumber || 'Pending OC'}
                      </div>
                    </td>
                    <td>
                      {quotes.length > 0 ? (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: '0.15rem' }}>
                            {quotes[0].title} ({quotes[0].id})
                          </div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                            ₹ {quotes[0].amount?.toLocaleString('en-IN') || 0}
                          </div>
                          <button 
                            className="btn btn-small" 
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.8rem', background: '#3B82F6', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)', cursor: 'pointer' }} 
                            onClick={(e) => { e.stopPropagation(); handleOpenQuoteModal(site, quotes[0]); }}
                          >
                            View / Edit
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No quotes yet</span>
                      )}
                    </td>
                    <td>
                      {activeQuote ? (
                        <div>
                          <div style={{ fontWeight: 700, color: '#16A34A' }}>{activeQuote.id}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{activeQuote.type}</div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>None</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={(e) => { e.stopPropagation(); handleOpenQuoteModal(site); }}
                          style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          New Quote
                        </button>
                        <button className="expand-btn" style={{ marginLeft: '0.25rem', padding: '0.35rem' }}>
                          {expandedRowId === site.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Details */}
                  {expandedRowId === site.id && (
                    <tr>
                      <td colSpan="5" style={{ padding: 0 }}>
                        <div className="expanded-content">
                          <div className="detail-grid">
                            {/* Left: Site Info */}
                            <div>
                              <div className="detail-section-title">Site Details</div>
                              <div className="info-row">
                                <MapPin className="info-icon" size={15} />
                                <span>{site.address || 'No Address Provided'}</span>
                              </div>
                              <div className="info-row">
                                <MessageSquare className="info-icon" size={15} />
                                <span>{site.remarks || 'No remarks.'}</span>
                              </div>
                            </div>

                            {/* Right: Quotes List & Confirmation */}
                            <div>
                              <div className="detail-section-title">Quotation History</div>
                              {quotes.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                  {quotes.map(q => (
                                    <div key={q.id} style={{ 
                                      fontSize: '0.8rem', 
                                      padding: '0.75rem', 
                                      border: `1px solid ${q.status === 'CONFIRMED' ? '#BBF7D0' : 'var(--border-color)'}`,
                                      borderRadius: '6px',
                                      background: q.status === 'CONFIRMED' ? '#F0FDF4' : 'var(--bg-surface-alt)',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center'
                                    }}>
                                      <div>
                                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{q.id} - {q.title}</div>
                                        <div style={{ color: 'var(--text-secondary)' }}>
                                          {q.type} • {q.interval} days • ₹{q.amount?.toLocaleString('en-IN') || 0}
                                        </div>
                                        <div style={{ marginTop: '0.25rem' }}>
                                          <span style={{ 
                                            color: q.status === 'CONFIRMED' ? '#16A34A' : '#D97706',
                                            fontSize: '0.7rem', fontWeight: 600,
                                            padding: '0.1rem 0.3rem',
                                            background: q.status === 'CONFIRMED' ? '#DCFCE7' : '#FEF3C7',
                                            borderRadius: '4px'
                                          }}>{q.status}</span>
                                        </div>
                                      </div>
                                      
                                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button 
                                          className="btn btn-secondary btn-small"
                                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                          onClick={() => handleOpenQuoteModal(site, q)}
                                        >
                                          View
                                        </button>
                                        {q.status !== 'CONFIRMED' && (
                                          <button 
                                            onClick={() => confirmQuote(site.id, q.id)}
                                            className="btn btn-primary btn-small" 
                                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                          >
                                            Confirm
                                          </button>
                                        )}
                                        <button 
                                          onClick={() => deleteQuote(site.id, q.id)}
                                          className="btn btn-secondary btn-small" 
                                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: '#EF4444', borderColor: '#FECACA', background: '#FEF2F2' }}
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No quotations generated yet.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {isQuoteModalOpen && (
        <AMCQuoteModal 
          isOpen={isQuoteModalOpen} 
          onClose={() => setIsQuoteModalOpen(false)} 
          site={sites.find(s => s.id.toString() === formSiteId) || sites[0]} 
          onSaveQuote={handleSaveQuote} 
          initialData={editingQuoteData}
        />
      )}
    </div>
  );
}
