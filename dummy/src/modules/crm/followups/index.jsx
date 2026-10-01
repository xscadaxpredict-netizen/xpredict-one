import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, 
  MapPin, 
  Phone, 
  MessageSquare, 
  X,
  UploadCloud,
  ChevronDown,
  ChevronUp,
  Clock,
  Search,
  Edit2,
  Trash2
} from 'lucide-react';

// Dummy Data
export const initialEnquiries = [
  {
    id: 1,
    customerName: 'TechCorp Solutions',
    contactPerson: 'Sarah Jenkins',
    address: '123 Business Park, Silicon Valley, CA',
    phone: '+1 (555) 123-4567',
    remarks: 'Looking for 5 new dealership licenses',
    status: 'CONFIRMED',
    confirmedQuoteId: 'q1',
    ocNumber: 'STP/OC/26-27/001',
    siteData: {
      dcNumber: 'DC/STP/26-27/045',
      serviceInterval: '30',
      lastServiced: '2026-09-01',
      serviceReports: [
        { 
          id: 1, 
          reportCode: 'SR-2026-081',
          date: '2026-09-01', 
          technician: 'Rahul Sharma', 
          zone: 'South Zone',
          remarks: 'Completed routine machine maintenance. Checked raw water pump pressure (3.5 bar), replaced 5-micron sediment cartridges, and flushed RO membranes.',
          workDone: 'Completed routine machine maintenance. Checked raw water pump pressure (3.5 bar), replaced 5-micron sediment cartridges, and flushed RO membranes.',
          servicePersonName: 'Rahul Sharma',
          status: 'AWAITING_CLIENT_SIGN',
          uploadedAt: '01 Sep 2026, 11:30 AM',
          attachments: [
            { name: 'ro_filter_replacement.png', size: '142.5 KB', type: 'IMAGE', dataUrl: '' },
            { name: 'pressure_gauge_log.pdf', size: '85.2 KB', type: 'DOC', dataUrl: '' }
          ]
        }
      ],
      waterReports: [
        { id: 1, date: '2026-09-01', ph: '7.2', tds: '150', hardness: '45', attachment: 'report_sep.pdf' }
      ],
      complaints: [
        { id: 'TKT-8291', date: '2026-09-20', issue: 'Pressure drop in the main line.', status: 'OPEN' }
      ]
    },
    quotes: [
      { 
        id: 'q1', 
        title: 'RO Plant Setup (Initial)', 
        quoteNo: 'XAS/26-27/1001', 
        amount: 162840, 
        date: '2026-09-24',
        items: [
          { id: 'p1', description: 'RO Plant 1000 LPH Fully Automatic', hsn: '84212190', basePrice: 120000, margin: 15, gstRate: 18, qty: 1 }
        ],
        toDetails: {
          customerName: 'TechCorp Solutions', contactPerson: 'Sarah Jenkins', phone: '+1 (555) 123-4567', address: '123 Business Park, Silicon Valley, CA', gst: '', pan: '', state: 'Karnataka'
        },
        terms: "1. Validity: 30 Days\n2. Payment: 100% Advance\n3. Delivery: 1-2 weeks from PO\n4. Warranty: 1 Year against manufacturing defects.",
        selectedBankId: 1
      }
    ],
    followups: [
      { id: 102, date: '2026-09-28', enteredDate: '2026-09-23', remarks: 'Call back to finalize the quote and send contract.' },
      { id: 101, date: '2026-09-25', enteredDate: '2026-09-20', remarks: 'Initial meeting went well. Needs a formal quote.' }
    ]
  },
  {
    id: 2,
    customerName: 'Global Industries',
    contactPerson: 'Mike Ross',
    address: '456 Industrial Way, New York, NY',
    phone: '+1 (555) 987-6543',
    remarks: 'Interested in upgrading their current system',
    status: 'PENDING',
    quotes: [],
    followups: [
      { id: 201, date: '2026-10-05', enteredDate: '2026-09-24', remarks: 'Schedule a demo for the new features.' }
    ]
  }
];

export function FollowupModal({ isOpen, onClose, onAddFollowup }) {
  const [newFollowup, setNewFollowup] = useState({ remarks: '', nextDate: '' });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onAddFollowup(newFollowup);
    setNewFollowup({ remarks: '', nextDate: '' });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add Follow-up</h2>
          <button type="button" className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Follow-up Discussion / Remarks</label>
              <textarea required className="form-control" rows="3" placeholder="What was discussed or needs to be done?" 
                value={newFollowup.remarks} onChange={e => setNewFollowup({...newFollowup, remarks: e.target.value})}></textarea>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Next Follow-up Date</label>
              <input required type="date" className="form-control" 
                value={newFollowup.nextDate} onChange={e => setNewFollowup({...newFollowup, nextDate: e.target.value})} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Follow-up</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- MAIN DASHBOARD COMPONENT ---
export function QuoteModal({ isOpen, onClose, enquiry, onSaveQuote, initialData }) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [quoteNo, setQuoteNo] = useState(initialData?.quoteNo || `XAS/26-27/${Math.floor(1000 + Math.random() * 9000)}`);
  
  // From Details State
  const [isEditingFrom, setIsEditingFrom] = useState(false);
  const [fromDetails, setFromDetails] = useState(initialData?.fromDetails || {
    companyName: 'Xpredict Automation Solutions Pvt Ltd',
    phone: '7795625583',
    email: 'info@xpredictlabs.com',
    gst: '29AAACX2581L1ZU',
    pan: 'AAACX2581L',
    address: 'Thimlapura Road, Hurulichikanahalli, Bengaluru 560090'
  });

  // To Details State
  const [isEditingTo, setIsEditingTo] = useState(false);
  const [toDetails, setToDetails] = useState(initialData?.toDetails || {
    customerName: '', contactPerson: '', phone: '', address: '', gst: '', pan: '', state: 'Karnataka'
  });

  useEffect(() => {
    if (enquiry && !initialData) {
      setToDetails(prev => ({
        ...prev,
        customerName: enquiry.customerName || '',
        contactPerson: enquiry.contactPerson || '',
        phone: enquiry.phone || '',
        address: enquiry.address || ''
      }));
    }
  }, [enquiry, initialData]);

  // Bank Details State
  const [banks, setBanks] = useState([
    { id: 1, bankName: 'HDFC Bank', accountNo: '50200055554444', ifsc: 'HDFC0001234' }
  ]);
  const [selectedBankId, setSelectedBankId] = useState(initialData?.selectedBankId || 1);
  const [isAddingBank, setIsAddingBank] = useState(false);
  const [newBank, setNewBank] = useState({ bankName: '', accountNo: '', ifsc: '' });

  // Items State
  const [items, setItems] = useState(initialData?.items || [
    { id: 1, description: '', hsn: '', basePrice: 0, margin: 0, gstRate: 18, qty: 1 }
  ]);

  const [productCatalog] = useState([
    { id: 'p1', description: 'RO Plant 1000 LPH Fully Automatic', hsn: '84212190', basePrice: 120000, margin: 15, gstRate: 18 },
    { id: 'p2', description: 'Water Softener 2000 LPH', hsn: '84212120', basePrice: 45000, margin: 20, gstRate: 18 },
    { id: 'p3', description: 'UV Purification System', hsn: '84219900', basePrice: 15000, margin: 10, gstRate: 18 }
  ]);

  // Terms State
  const [isEditingTerms, setIsEditingTerms] = useState(false);
  const [terms, setTerms] = useState(initialData?.terms || "1. Validity: 30 Days\n2. Payment: 100% Advance\n3. Delivery: 1-2 weeks from PO\n4. Warranty: 1 Year against manufacturing defects.");

  if (!isOpen || !enquiry) return null;

  const handleAddItem = () => {
    setItems([...items, { id: Date.now(), description: '', hsn: '', basePrice: 0, margin: 0, gstRate: 18, qty: 1 }]);
  };

  const handleRemoveItem = (id) => {
    setItems(items.filter(i => i.id !== id));
  };

  const updateItem = (id, field, value) => {
    setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleSelectProduct = (itemId, productId) => {
    if(!productId) return;
    const product = productCatalog.find(p => p.id === productId);
    if(product) {
      setItems(items.map(i => i.id === itemId ? {
        ...i, 
        description: product.description, 
        hsn: product.hsn, 
        basePrice: product.basePrice, 
        margin: product.margin,
        gstRate: product.gstRate
      } : i));
    }
  };

  const getItemTaxable = (item) => {
    const finalUnit = item.basePrice + (item.basePrice * ((item.margin || 0) / 100));
    return finalUnit * (item.qty || 1);
  };
  
  const getItemGstAmount = (item) => {
    return getItemTaxable(item) * ((item.gstRate || 0) / 100);
  };

  const getItemTotal = (item) => {
    return getItemTaxable(item) + getItemGstAmount(item);
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + getItemTaxable(item), 0);
  };
  
  const calculateTotalGst = () => {
    return items.reduce((sum, item) => sum + getItemGstAmount(item), 0);
  };

  const getTaxType = () => {
    if (toDetails.gst && toDetails.gst.startsWith('29')) return 'CGST_SGST';
    if (toDetails.gst && !toDetails.gst.startsWith('29')) return 'IGST';
    if (toDetails.state === 'Karnataka') return 'CGST_SGST';
    return 'IGST';
  };

  const saveNewBank = () => {
    if(newBank.bankName && newBank.accountNo) {
      const bank = { ...newBank, id: Date.now() };
      setBanks([...banks, bank]);
      setSelectedBankId(bank.id);
      setIsAddingBank(false);
      setNewBank({ bankName: '', accountNo: '', ifsc: '' });
    }
  };

  return (
    <div className="modal-overlay quote-modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal-content quote-modal-content" style={{ maxWidth: '1400px', width: '95vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ background: 'var(--bg-surface-alt)' }}>
          <h2 className="modal-title" style={{ fontSize: '1.25rem' }}>Create Quotation</h2>
          <button className="close-btn" onClick={onClose}><X size={24} /></button>
        </div>
        
        <div className="modal-body" style={{ padding: '2rem' }}>
          {/* Top Section: Title & Quote No */}
          <div className="form-row" style={{ marginBottom: '2rem' }}>
            <div className="form-group">
              <label className="form-label">Quotation Title</label>
              <input type="text" className="form-control" placeholder="e.g. RO Plant 1000LPH Setup" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Quotation No. (Standard/Govt)</label>
              <input type="text" className="form-control" value={quoteNo} onChange={e => setQuoteNo(e.target.value)} />
            </div>
          </div>

          <div className="quote-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
            {/* FROM SECTION */}
            <div style={{ background: 'var(--bg-surface-alt)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.5rem', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4 style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>From (Dealer Details)</h4>
                <button className="btn-icon" onClick={() => setIsEditingFrom(!isEditingFrom)}>
                  <Edit2 size={14} />
                </button>
              </div>

              {isEditingFrom ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <input className="form-control" value={fromDetails.companyName} onChange={e => setFromDetails({...fromDetails, companyName: e.target.value})} placeholder="Company Name" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input className="form-control" value={fromDetails.phone} onChange={e => setFromDetails({...fromDetails, phone: e.target.value})} placeholder="Phone" />
                    <input className="form-control" value={fromDetails.email} onChange={e => setFromDetails({...fromDetails, email: e.target.value})} placeholder="Email" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input className="form-control" value={fromDetails.gst} onChange={e => setFromDetails({...fromDetails, gst: e.target.value})} placeholder="GST No." />
                    <input className="form-control" value={fromDetails.pan} onChange={e => setFromDetails({...fromDetails, pan: e.target.value})} placeholder="PAN No." />
                  </div>
                  <textarea className="form-control" value={fromDetails.address} onChange={e => setFromDetails({...fromDetails, address: e.target.value})} placeholder="Address" rows={2}></textarea>
                  <button className="btn btn-primary btn-small" onClick={() => setIsEditingFrom(false)}>Save Details</button>
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--text-primary)', fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>{fromDetails.companyName}</strong>
                  <div>Phone: {fromDetails.phone} | Email: {fromDetails.email}</div>
                  <div>GST: {fromDetails.gst} | PAN: {fromDetails.pan}</div>
                  <div style={{ marginTop: '0.5rem' }}>{fromDetails.address}</div>
                </div>
              )}
            </div>

            {/* TO SECTION */}
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 'var(--radius-md)', padding: '1.5rem', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4 style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>To (Customer Details)</h4>
                <button className="btn-icon" onClick={() => setIsEditingTo(!isEditingTo)}>
                  <Edit2 size={14} />
                </button>
              </div>

              {isEditingTo ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <input className="form-control" value={toDetails.customerName} onChange={e => setToDetails({...toDetails, customerName: e.target.value})} placeholder="Customer Name" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input className="form-control" value={toDetails.contactPerson} onChange={e => setToDetails({...toDetails, contactPerson: e.target.value})} placeholder="Contact Person" />
                    <input className="form-control" value={toDetails.phone} onChange={e => setToDetails({...toDetails, phone: e.target.value})} placeholder="Phone" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input className="form-control" value={toDetails.gst} onChange={e => setToDetails({...toDetails, gst: e.target.value})} placeholder="GST No." />
                    <input className="form-control" value={toDetails.pan} onChange={e => setToDetails({...toDetails, pan: e.target.value})} placeholder="PAN No." />
                  </div>
                  <textarea className="form-control" value={toDetails.address} onChange={e => setToDetails({...toDetails, address: e.target.value})} placeholder="Address" rows={2}></textarea>
                  <button className="btn btn-primary btn-small" onClick={() => setIsEditingTo(false)}>Save Details</button>
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--text-primary)', fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>{toDetails.customerName}</strong>
                  <div>Attn: {toDetails.contactPerson} | Phone: {toDetails.phone}</div>
                  {toDetails.gst || toDetails.pan ? (
                    <div>GST: {toDetails.gst || 'N/A'} | PAN: {toDetails.pan || 'N/A'}</div>
                  ) : null}
                  <div style={{ marginTop: '0.5rem' }}>{toDetails.address}</div>
                </div>
              )}
            </div>
          </div>

          {/* BANK DETAILS SECTION */}
          <div style={{ marginBottom: '2.5rem', background: 'var(--bg-surface-alt)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4 style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>Bank Details *</h4>
                {!isAddingBank && (
                  <button className="btn btn-secondary btn-small" onClick={() => setIsAddingBank(true)}>+ Add New Bank</button>
                )}
              </div>
              
              {isAddingBank ? (
                <div className="quote-bank-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Bank Name</label><input className="form-control" value={newBank.bankName} onChange={e => setNewBank({...newBank, bankName: e.target.value})} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Account No.</label><input className="form-control" value={newBank.accountNo} onChange={e => setNewBank({...newBank, accountNo: e.target.value})} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">IFSC Code</label><input className="form-control" value={newBank.ifsc} onChange={e => setNewBank({...newBank, ifsc: e.target.value})} /></div>
                  <button className="btn btn-primary" onClick={saveNewBank}>Save</button>
                </div>
              ) : (
                <select className="form-control" value={selectedBankId} onChange={(e) => setSelectedBankId(Number(e.target.value))}>
                  {banks.map(b => (
                    <option key={b.id} value={b.id}>{b.bankName} - A/C: {b.accountNo} (IFSC: {b.ifsc})</option>
                  ))}
                </select>
              )}
          </div>

          {/* STATE SELECT (IF NO GST) */}
          {!toDetails.gst && (
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: '#991B1B', fontWeight: 600 }}>No GST Number provided. Please select supply state to calculate Tax correctly:</span>
                <select className="form-control" style={{ width: 'auto', minWidth: '200px', padding: '0.35rem 0.5rem' }} value={toDetails.state} onChange={e => setToDetails({...toDetails, state: e.target.value})}>
                  <option value="Karnataka">Karnataka (CGST/SGST)</option>
                  <option value="Maharashtra">Maharashtra (IGST)</option>
                  <option value="Tamil Nadu">Tamil Nadu (IGST)</option>
                  <option value="Delhi">Delhi (IGST)</option>
                  <option value="Other">Other State (IGST)</option>
                </select>
              </div>
            </div>
          )}

          {/* ITEMS SECTION */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>Item Details</h4>
            </div>
            
            <div className="quote-items-wrapper">
              <table className="data-table quote-item-table" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: '1rem' }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: '220px' }}>Description</th>
                    <th style={{ width: '90px' }}>HSN</th>
                    <th style={{ width: '100px', textAlign: 'right' }}>Base (₹)</th>
                    <th style={{ width: '70px', textAlign: 'right' }}>Margin%</th>
                    <th style={{ width: '60px', textAlign: 'center' }}>Qty</th>
                    <th style={{ width: '70px', textAlign: 'right' }}>GST%</th>
                    <th style={{ width: '90px', textAlign: 'right' }}>GST (₹)</th>
                    <th style={{ width: '120px', textAlign: 'right' }}>Total (₹)</th>
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.5rem' }}>
                        <select className="form-control" style={{ marginBottom: '0.25rem', fontSize: '0.75rem', padding: '0.2rem' }} onChange={(e) => handleSelectProduct(item.id, e.target.value)}>
                          <option value="">-- Load Preset... --</option>
                          {productCatalog.map(p => (
                            <option key={p.id} value={p.id}>{p.description}</option>
                          ))}
                        </select>
                        <textarea 
                          className="form-control" 
                          placeholder="Item description..." 
                          rows={2}
                          value={item.description}
                          onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        ></textarea>
                      </td>
                      <td style={{ padding: '0.5rem', verticalAlign: 'top' }}>
                        <input type="text" className="form-control" placeholder="HSN" value={item.hsn} onChange={(e) => updateItem(item.id, 'hsn', e.target.value)} />
                      </td>
                      <td style={{ padding: '0.5rem', verticalAlign: 'top' }}>
                        <input type="number" className="form-control" style={{ textAlign: 'right' }} value={item.basePrice || ''} onChange={(e) => updateItem(item.id, 'basePrice', Number(e.target.value))} />
                      </td>
                      <td style={{ padding: '0.5rem', verticalAlign: 'top' }}>
                        <input type="number" className="form-control" style={{ textAlign: 'right' }} value={item.margin || ''} onChange={(e) => updateItem(item.id, 'margin', Number(e.target.value))} />
                      </td>
                      <td style={{ padding: '0.5rem', verticalAlign: 'top' }}>
                        <input type="number" className="form-control" style={{ textAlign: 'center' }} value={item.qty} onChange={(e) => updateItem(item.id, 'qty', Number(e.target.value))} />
                      </td>
                      <td style={{ padding: '0.5rem', verticalAlign: 'top' }}>
                        <input type="number" className="form-control" style={{ textAlign: 'right' }} value={item.gstRate || ''} onChange={(e) => updateItem(item.id, 'gstRate', Number(e.target.value))} />
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 500, verticalAlign: 'top', paddingTop: '1rem', color: 'var(--text-secondary)' }}>
                        {getItemGstAmount(item).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700, verticalAlign: 'top', paddingTop: '1rem', color: 'var(--text-primary)' }}>
                        {getItemTotal(item).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', verticalAlign: 'top', paddingTop: '1rem' }}>
                        <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => handleRemoveItem(item.id)}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="quote-action-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <button className="btn btn-secondary btn-small" onClick={handleAddItem}>
                + Add Another Item
              </button>
              
              <div className="quote-subtotal" style={{ width: '300px', background: 'var(--bg-surface-alt)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                  <span>Total Taxable Value</span>
                  <span>₹ {calculateSubtotal().toLocaleString('en-IN')}</span>
                </div>
                {getTaxType() === 'CGST_SGST' ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                      <span>CGST</span>
                      <span>₹ {(calculateTotalGst() / 2).toLocaleString('en-IN')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                      <span>SGST</span>
                      <span>₹ {(calculateTotalGst() / 2).toLocaleString('en-IN')}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                    <span>IGST</span>
                    <span>₹ {calculateTotalGst().toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                  <span>Grand Total</span>
                  <span>₹ {(calculateSubtotal() + calculateTotalGst()).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          {/* TERMS & CONDITIONS SECTION */}
          <div style={{ marginTop: '2.5rem', background: 'var(--bg-surface-alt)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.5rem', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>Terms & Conditions</h4>
              <button className="btn-icon" onClick={() => setIsEditingTerms(!isEditingTerms)}>
                <Edit2 size={14} />
              </button>
            </div>
            {isEditingTerms ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <textarea className="form-control" value={terms} onChange={e => setTerms(e.target.value)} rows={6}></textarea>
                <button className="btn btn-primary btn-small" onClick={() => setIsEditingTerms(false)}>Save Terms</button>
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {terms}
              </div>
            )}
          </div>
        </div>
        </div>
        
        <div className="modal-footer" style={{ padding: '1.5rem 2rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => { 
            const total = calculateSubtotal() + calculateTotalGst();
            onSaveQuote(enquiry.id, {
              id: initialData?.id || Date.now().toString(),
              title: title || 'Untitled Quotation',
              quoteNo: quoteNo,
              amount: total,
              date: initialData?.date || new Date().toISOString().split('T')[0],
              fromDetails,
              toDetails,
              selectedBankId,
              items,
              terms
            });
            onClose(); 
          }}>Save & Generate PDF</button>
        </div>
      </div>
    </div>
  );
}

// --- QUOTE MODAL COMPONENT ---
export default function FollowupsDashboard({ enquiries, setEnquiries }) {
  const [isEnquiryModalOpen, setIsEnquiryModalOpen] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Followup Modal
  const [isFollowupModalOpen, setIsFollowupModalOpen] = useState(false);
  const [activeEnquiryId, setActiveEnquiryId] = useState(null);

  // Quote Modal
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [selectedEnquiryForQuote, setSelectedEnquiryForQuote] = useState(null);
  const [editingQuoteData, setEditingQuoteData] = useState(null);

  const openQuoteModal = (enquiryId, quoteData = null) => {
    setSelectedEnquiryForQuote(enquiries.find(e => e.id === enquiryId));
    setEditingQuoteData(quoteData);
    setIsQuoteModalOpen(true);
  };
  
  const openFollowupModal = (enquiryId) => {
    setActiveEnquiryId(enquiryId);
    setIsFollowupModalOpen(true);
  };

  const [newEnquiry, setNewEnquiry] = useState({
    customerName: '', contactPerson: '', address: '', pincode: '', phone: '', remarks: '', followupRemarks: '', followupNextDate: ''
  });
  const [newFollowup, setNewFollowup] = useState({ remarks: '', nextDate: '' });

  const handleSaveQuote = (enquiryId, quoteData) => {
    setEnquiries(enquiries.map(enq => {
      if (enq.id === enquiryId) {
        const existingIndex = (enq.quotes || []).findIndex(q => q.id === quoteData.id);
        if (existingIndex >= 0) {
          const updatedQuotes = [...enq.quotes];
          updatedQuotes[existingIndex] = quoteData;
          return { ...enq, quotes: updatedQuotes };
        } else {
          return { ...enq, quotes: [...(enq.quotes || []), quoteData] };
        }
      }
      return enq;
    }));
  };

  const handleConfirmOrder = (enquiryId, quoteId) => {
    if (!window.confirm('Are you sure you want to confirm this order? This will mark the enquiry as WON.')) return;
    const ocNumber = `STP/OC/26-27/${String(Math.floor(Math.random() * 900) + 100).padStart(3, '0')}`;
    setEnquiries(enquiries.map(enq => {
      if (enq.id === enquiryId) {
        return { ...enq, status: 'CONFIRMED', confirmedQuoteId: quoteId, ocNumber };
      }
      return enq;
    }));
  };

  const handleDeleteQuote = (enquiryId, quoteId) => {
    if (!window.confirm('Are you sure you want to delete this quote? This action cannot be undone.')) return;
    setEnquiries(enquiries.map(enq => {
      if (enq.id === enquiryId) {
        const updatedQuotes = (enq.quotes || []).filter(q => q.id !== quoteId);
        const status = enq.confirmedQuoteId === quoteId ? 'PENDING' : enq.status;
        return { ...enq, quotes: updatedQuotes, confirmedQuoteId: enq.confirmedQuoteId === quoteId ? null : enq.confirmedQuoteId, status };
      }
      return enq;
    }));
  };

  const handleCreateEnquiry = (e) => {
    e.preventDefault();
    const today = new Date().toISOString().split('T')[0];
    const enquiry = {
      id: Date.now(),
      customerName: newEnquiry.customerName,
      contactPerson: newEnquiry.contactPerson,
      address: newEnquiry.address,
      pincode: newEnquiry.pincode,
      phone: newEnquiry.phone,
      remarks: newEnquiry.remarks,
      status: 'PENDING',
      quotes: [],
      followups: [{ id: Date.now() + 1, date: newEnquiry.followupNextDate, enteredDate: today, remarks: newEnquiry.followupRemarks }]
    };
    setEnquiries([enquiry, ...enquiries]);
    setIsEnquiryModalOpen(false);
    setNewEnquiry({ customerName: '', contactPerson: '', address: '', pincode: '', phone: '', remarks: '', followupRemarks: '', followupNextDate: '' });
  };

  const handleAddFollowup = (e) => {
    e.preventDefault();
    const today = new Date().toISOString().split('T')[0];
    const followup = { id: Date.now(), date: newFollowup.nextDate, enteredDate: today, remarks: newFollowup.remarks };
    setEnquiries(enquiries.map(enq => {
      if (enq.id === activeEnquiryId) return { ...enq, followups: [followup, ...enq.followups] };
      return enq;
    }));
    setIsFollowupModalOpen(false);
    setNewFollowup({ remarks: '', nextDate: '' });
  };


  const toggleRow = (id) => { setExpandedRowId(expandedRowId === id ? null : id); };

  const filteredEnquiries = enquiries.filter(e => 
    e.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    e.contactPerson.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Enquiries & Follow-ups</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.88rem' }}>Manage customer enquiries and schedule follow-ups</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search..." 
              className="form-control search-box"
              style={{ paddingLeft: '2.25rem', width: '220px', borderRadius: '999px', fontSize: '0.85rem' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setIsEnquiryModalOpen(true)}>
            <PlusCircle size={16} /> New Enquiry
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Contact</th>
              <th>Latest Follow-up</th>
              <th>Latest Quotation</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredEnquiries.map((enq) => (
              <React.Fragment key={enq.id}>
                <tr className={`table-row ${expandedRowId === enq.id ? 'expanded' : ''}`} onClick={() => toggleRow(enq.id)} style={{ cursor: 'pointer' }}>
                  <td className="td-name">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {enq.customerName}
                      {enq.status === 'CONFIRMED' && (
                        <span style={{ fontSize: '0.65rem', background: 'var(--success)', color: '#fff', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>WON</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '0.1rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Phone size={11} /> {enq.phone}
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{enq.contactPerson}</td>
                  <td>
                    {enq.followups.length > 0 ? (
                      <div>
                        <span className="badge" style={{ marginBottom: '0.3rem', display: 'inline-block' }}>{enq.followups[0].date}</span>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                          {enq.followups[0].remarks}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No follow-up yet</span>
                    )}
                  </td>
                  <td>
                    {enq.quotes && enq.quotes.length > 0 ? (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: '0.15rem' }}>
                          {enq.quotes[enq.quotes.length - 1].title}
                        </div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                          ₹ {enq.quotes[enq.quotes.length - 1].amount.toLocaleString('en-IN')}
                        </div>
                        <button className="btn btn-small" style={{ fontSize: '0.75rem', padding: '0.3rem 0.8rem', background: '#3B82F6', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openQuoteModal(enq.id, enq.quotes[enq.quotes.length - 1]); }}>
                          View / Edit
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No quotes yet</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button className="btn btn-secondary btn-small" onClick={(e) => { e.stopPropagation(); openQuoteModal(enq.id); }}>
                        Create Quote
                      </button>
                      <button className="btn btn-primary btn-small" onClick={(e) => { e.stopPropagation(); openFollowupModal(enq.id); }}>
                        <PlusCircle size={14} /> Follow-up
                      </button>
                      <button className="expand-btn" style={{ marginLeft: '0.25rem', padding: '0.35rem' }}>
                        {expandedRowId === enq.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Expanded Details */}
                {expandedRowId === enq.id && (
                  <tr>
                    <td colSpan="5" style={{ padding: 0 }}>
                      <div className="expanded-content">
                        <div className="detail-grid">
                          {/* Left: Enquiry Info */}
                          <div>
                            <div className="detail-section-title">Enquiry Details</div>
                            <div className="info-row">
                              <MapPin className="info-icon" size={15} />
                              <span>{enq.address} {enq.pincode ? `- ${enq.pincode}` : ''}</span>
                            </div>
                            <div className="info-row">
                              <MessageSquare className="info-icon" size={15} />
                              <span>{enq.remarks}</span>
                            </div>
                          </div>

                          {/* Right: Follow-ups */}
                          <div>
                            <div className="detail-section-title">Follow-up History</div>
                            {enq.followups.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                <div className="latest-followup">
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                    <span className="followup-date">Due: {enq.followups[0].date}</span>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Added {enq.followups[0].enteredDate}</span>
                                  </div>
                                  <p className="followup-text">{enq.followups[0].remarks}</p>
                                </div>

                                {enq.followups.length > 1 && (
                                  <div>
                                    <button 
                                      className="btn-icon"
                                      style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontFamily: 'inherit', padding: '0.3rem 0' }}
                                      onClick={(e) => { e.stopPropagation(); setExpandedHistoryId(expandedHistoryId === enq.id ? null : enq.id); }}
                                    >
                                      {expandedHistoryId === enq.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                      {expandedHistoryId === enq.id ? 'Hide past' : `${enq.followups.length - 1} older follow-up${enq.followups.length > 2 ? 's' : ''}`}
                                    </button>

                                    {expandedHistoryId === enq.id && (
                                      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {enq.followups.slice(1).map((f) => (
                                          <div key={f.id} className="past-followup">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                                              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.78rem' }}>Due: {f.date}</span>
                                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Added {f.enteredDate}</span>
                                            </div>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{f.remarks}</p>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No follow-ups yet.</p>
                            )}
                          </div>
                        </div>

                        {/* Quotations Section */}
                        {enq.quotes && enq.quotes.length > 0 && (
                          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)', cursor: 'default' }} onClick={e => e.stopPropagation()}>
                            <div className="detail-section-title" style={{ marginBottom: '0.75rem' }}>Generated Quotations</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                              {enq.quotes.map(quote => (
                                <div key={quote.id} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 'var(--radius-sm)', padding: '1.25rem', position: 'relative' }}>
                                  {enq.status === 'CONFIRMED' && enq.confirmedQuoteId === quote.id && (
                                    <span style={{ position: 'absolute', top: '-10px', right: '10px', background: 'var(--success)', color: '#fff', fontSize: '0.65rem', padding: '0.2rem 0.6rem', borderRadius: '999px', fontWeight: 700, boxShadow: 'var(--shadow-sm)' }}>✓ ORDER CONFIRMED</span>
                                  )}
                                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem', fontSize: '0.95rem', paddingRight: enq.status === 'CONFIRMED' ? '90px' : '0' }}>{quote.title}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', fontWeight: 500 }}>
                                    <span>#{quote.quoteNo}</span>
                                    <span>{quote.date}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #CBD5E1', paddingTop: '0.75rem' }}>
                                    <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1.1rem' }}>₹ {quote.amount.toLocaleString('en-IN')}</span>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                      <button className="btn btn-small" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', background: '#3B82F6', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openQuoteModal(enq.id, quote); }}>
                                        View / Edit
                                      </button>
                                      {enq.status !== 'CONFIRMED' && (
                                        <button className="btn btn-primary btn-small" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={(e) => { e.stopPropagation(); handleConfirmOrder(enq.id, quote.id); }}>
                                          Confirm Order
                                        </button>
                                      )}
                                      <button className="btn btn-secondary btn-small" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: '#EF4444', borderColor: '#FECACA', background: '#FEF2F2' }} onClick={(e) => { e.stopPropagation(); handleDeleteQuote(enq.id, quote.id); }}>
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* NEW ENQUIRY MODAL */}
      {isEnquiryModalOpen && (
        <div className="modal-overlay" onClick={() => setIsEnquiryModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">New Enquiry</h2>
              <button className="close-btn" onClick={() => setIsEnquiryModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateEnquiry}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Customer Name</label>
                    <input required type="text" className="form-control" placeholder="e.g. Acme Corp" 
                      value={newEnquiry.customerName} onChange={e => setNewEnquiry({...newEnquiry, customerName: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contact Person</label>
                    <input required type="text" className="form-control" placeholder="e.g. John Smith" 
                      value={newEnquiry.contactPerson} onChange={e => setNewEnquiry({...newEnquiry, contactPerson: e.target.value})} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label className="form-label">Address</label>
                    <input required type="text" className="form-control" placeholder="Full address" 
                      value={newEnquiry.address} onChange={e => setNewEnquiry({...newEnquiry, address: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Pincode</label>
                    <input required type="text" className="form-control" placeholder="e.g. 560001" 
                      value={newEnquiry.pincode} onChange={e => setNewEnquiry({...newEnquiry, pincode: e.target.value})} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input required type="text" className="form-control" placeholder="+1 (123) 456-7890" 
                    value={newEnquiry.phone} onChange={e => setNewEnquiry({...newEnquiry, phone: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Enquiry Remarks</label>
                  <textarea required className="form-control" placeholder="What is the customer looking for?" 
                    value={newEnquiry.remarks} onChange={e => setNewEnquiry({...newEnquiry, remarks: e.target.value})}></textarea>
                </div>
                <div className="form-group">
                  <label className="form-label">Attachment</label>
                  <label className="file-upload-box">
                    <UploadCloud className="icon" size={28} />
                    <span className="text">Click to upload</span>
                  </label>
                </div>
                <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid var(--border-color)' }} />
                <div className="detail-section-title" style={{ marginBottom: '0.75rem' }}>Initial Follow-up</div>
                <div className="form-group">
                  <label className="form-label">Follow-up Remarks</label>
                  <textarea required className="form-control" placeholder="E.g. Send pricing quote next week." 
                    value={newEnquiry.followupRemarks} onChange={e => setNewEnquiry({...newEnquiry, followupRemarks: e.target.value})}></textarea>
                </div>
                <div className="form-group">
                  <label className="form-label">Next Follow-up Date</label>
                  <input required type="date" className="form-control" 
                    value={newEnquiry.followupNextDate} onChange={e => setNewEnquiry({...newEnquiry, followupNextDate: e.target.value})} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsEnquiryModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Enquiry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD FOLLOWUP MODAL */}
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

      {/* ADVANCED QUOTE MODAL */}
      <QuoteModal 
        isOpen={isQuoteModalOpen} 
        onClose={() => setIsQuoteModalOpen(false)} 
        enquiry={selectedEnquiryForQuote}
        onSaveQuote={handleSaveQuote}
        initialData={editingQuoteData}
      />
    </div>
  );
}
