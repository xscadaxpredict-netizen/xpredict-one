import React, { useState, useEffect } from 'react';
import { X, Edit2, Trash2 } from 'lucide-react';

export default function AMCQuoteModal({ isOpen, onClose, site, onSaveQuote, initialData }) {
  const [title, setTitle] = useState(initialData?.title || 'Annual Maintenance Contract');
  const [quoteNo, setQuoteNo] = useState(initialData?.quoteNo || `AMC/26-27/${Math.floor(1000 + Math.random() * 9000)}`);
  
  // AMC Specific Fields
  const [amcType, setAmcType] = useState(initialData?.type || 'Comprehensive');
  const [interval, setInterval] = useState(initialData?.interval || '90');

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
    if (site && !initialData) {
      setToDetails(prev => ({
        ...prev,
        customerName: site.customerName || '',
        contactPerson: site.contactPerson || '',
        phone: site.phone || '',
        address: site.address || ''
      }));
    }
  }, [site, initialData]);

  // Bank Details State
  const [banks, setBanks] = useState([
    { id: 1, bankName: 'HDFC Bank', accountNo: '50200055554444', ifsc: 'HDFC0001234' }
  ]);
  const [selectedBankId, setSelectedBankId] = useState(initialData?.selectedBankId || 1);
  const [isAddingBank, setIsAddingBank] = useState(false);
  const [newBank, setNewBank] = useState({ bankName: '', accountNo: '', ifsc: '' });

  // Items State
  const [items, setItems] = useState(initialData?.items || [
    { id: 1, description: '', hsn: '9987', basePrice: 0, margin: 0, gstRate: 18, qty: 1 }
  ]);

  const [productCatalog] = useState([
    { id: 'p1', description: 'Comprehensive AMC - RO Plant 1000 LPH', hsn: '9987', basePrice: 25000, margin: 10, gstRate: 18 },
    { id: 'p2', description: 'Non-Comprehensive AMC - RO Plant 1000 LPH', hsn: '9987', basePrice: 12000, margin: 10, gstRate: 18 },
    { id: 'p3', description: 'Membrane Replacement Service', hsn: '9987', basePrice: 8000, margin: 10, gstRate: 18 }
  ]);

  // Terms State
  const [isEditingTerms, setIsEditingTerms] = useState(false);
  const [terms, setTerms] = useState(initialData?.terms || "1. Validity: 30 Days\n2. Payment: 100% Advance before service\n3. Coverage: As per AMC Type selected\n4. Exclusions: Consumables (unless comprehensive).");

  if (!isOpen || !site) return null;

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
          <h2 className="modal-title" style={{ fontSize: '1.25rem' }}>Create AMC Quotation</h2>
          <button className="close-btn" onClick={onClose}><X size={24} /></button>
        </div>
        
        <div className="modal-body" style={{ padding: '2rem' }}>
          {/* Top Section: Title, Quote No, AMC Type, Interval */}
          <div className="form-row" style={{ marginBottom: '2rem' }}>
            <div className="form-group">
              <label className="form-label">Quotation Title</label>
              <input type="text" className="form-control" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">AMC Quotation No.</label>
              <input type="text" className="form-control" value={quoteNo} onChange={e => setQuoteNo(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">AMC Type</label>
              <select className="form-control" value={amcType} onChange={e => setAmcType(e.target.value)}>
                <option value="Comprehensive">Comprehensive</option>
                <option value="Non Comprehensive">Non Comprehensive</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Service Interval (Days)</label>
              <select className="form-control" value={interval} onChange={e => setInterval(e.target.value)}>
                <option value="30">30 Days</option>
                <option value="60">60 Days</option>
                <option value="90">90 Days</option>
                <option value="180">180 Days</option>
                <option value="365">365 Days</option>
              </select>
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
            onSaveQuote(site.id, {
              id: initialData?.id || `AMC-${Math.floor(1000 + Math.random() * 9000)}`,
              title: title || 'AMC Quotation',
              quoteNo: quoteNo,
              type: amcType,
              interval: interval,
              amount: total,
              date: initialData?.date || new Date().toISOString().split('T')[0],
              fromDetails,
              toDetails,
              selectedBankId,
              items,
              terms,
              status: initialData?.status || 'QUOTE_SENT'
            });
            onClose(); 
          }}>Save & Generate PDF</button>
        </div>
      </div>
    </div>
  );
}
