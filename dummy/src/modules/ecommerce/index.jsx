import React, { useState } from 'react';
import { ShoppingCart, Plus, Minus, ChevronDown, ChevronUp, Package, CreditCard, List } from 'lucide-react';

const CATALOG = {
  'Pumps': [
    { id: 'p1', name: 'High Pressure RO Pump', price: 450, stock: 12, image: 'https://placehold.co/200x200/e2e8f0/64748b?text=Pump+2HP', specs: ['Power: 2HP', 'Flow Rate: 1000 LPH', 'Material: SS304'] },
    { id: 'p2', name: 'Raw Water Feed Pump', price: 320, stock: 8, image: 'https://placehold.co/200x200/e2e8f0/64748b?text=Feed+Pump', specs: ['Power: 1HP', 'Flow Rate: 500 LPH', 'Material: Cast Iron'] },
    { id: 'p3', name: 'Chemical Dosing Pump', price: 150, stock: 25, image: 'https://placehold.co/200x200/e2e8f0/64748b?text=Dosing+Pump', specs: ['Capacity: 0-5 LPH', 'Pressure: 5 Bar', 'Type: Diaphragm'] },
  ],
  'Valves': [
    { id: 'v1', name: 'Multiport Valve (Top Mount)', price: 85, stock: 40, image: 'https://placehold.co/200x200/e2e8f0/64748b?text=MPV', specs: ['Size: 1.5 Inch', 'Type: Top Mount', 'Max Pressure: 4 Bar'] },
    { id: 'v2', name: 'Solenoid Valve 1/2"', price: 45, stock: 60, image: 'https://placehold.co/200x200/e2e8f0/64748b?text=Solenoid', specs: ['Size: 1/2 Inch', 'Voltage: 230V AC', 'Material: Brass'] },
    { id: 'v3', name: 'Butterfly Valve 2"', price: 120, stock: 15, image: 'https://placehold.co/200x200/e2e8f0/64748b?text=Butterfly', specs: ['Size: 2 Inch', 'Operation: Lever', 'Seal: EPDM'] },
  ],
  'Blowers': [
    { id: 'b1', name: 'Twin Lobe Air Blower', price: 850, stock: 5, image: 'https://placehold.co/200x200/e2e8f0/64748b?text=Twin+Lobe', specs: ['Power: 3HP', 'Air Flow: 150 CFM', 'Pressure: 0.4 Kg/cm2'] },
    { id: 'b2', name: 'Side Channel Blower', price: 420, stock: 10, image: 'https://placehold.co/200x200/e2e8f0/64748b?text=Ring+Blower', specs: ['Power: 1.5HP', 'Stage: Single', 'Vacuum: -210 mbar'] },
  ],
  'Tanks': [
    { id: 't1', name: 'FRP Vessel 13x54', price: 210, stock: 18, image: 'https://placehold.co/200x200/e2e8f0/64748b?text=FRP+13x54', specs: ['Dimensions: 13" x 54"', 'Volume: 105 Liters', 'Max Pressure: 150 psi'] },
    { id: 't2', name: 'FRP Vessel 14x65', price: 280, stock: 12, image: 'https://placehold.co/200x200/e2e8f0/64748b?text=FRP+14x65', specs: ['Dimensions: 14" x 65"', 'Volume: 140 Liters', 'Max Pressure: 150 psi'] },
    { id: 't3', name: 'Brine Tank 100L', price: 95, stock: 30, image: 'https://placehold.co/200x200/e2e8f0/64748b?text=Brine+Tank', specs: ['Capacity: 100 Liters', 'Material: HDPE', 'Includes: Brine Valve'] },
  ],
  'Structure': [
    { id: 's1', name: 'SS 304 Skid Frame', price: 600, stock: 4, image: 'https://placehold.co/200x200/e2e8f0/64748b?text=SS+Skid', specs: ['Material: SS 304', 'Finish: Polished', 'Type: Standard RO'] },
    { id: 's2', name: 'MS Epoxy Coated Frame', price: 350, stock: 7, image: 'https://placehold.co/200x200/e2e8f0/64748b?text=MS+Skid', specs: ['Material: Mild Steel', 'Coating: Epoxy Powder', 'Type: Heavy Duty'] },
  ]
};

export default function EcommerceDashboard({ enquiries, setEnquiries }) {
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [activeTab, setActiveTab] = useState('store');
  const [expandedCategory, setExpandedCategory] = useState('Pumps');
  const [cart, setCart] = useState({}); // { itemId: quantity }
  
  const confirmedSites = enquiries.filter(e => e.status === 'CONFIRMED');
  const selectedSite = confirmedSites.find(s => s.id.toString() === selectedSiteId);

  const handleAddToCart = (item) => {
    setCart(prev => ({
      ...prev,
      [item.id]: (prev[item.id] || 0) + 1
    }));
  };

  const handleUpdateQuantity = (itemId, delta) => {
    setCart(prev => {
      const current = prev[itemId] || 0;
      const next = current + delta;
      if (next <= 0) {
        const newCart = { ...prev };
        delete newCart[itemId];
        return newCart;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const handlePlaceOrder = () => {
    if (!selectedSite) return alert('Please select a site/customer first.');
    if (Object.keys(cart).length === 0) return alert('Cart is empty.');

    const orderId = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    const orderItems = Object.entries(cart).map(([itemId, qty]) => {
      let foundItem = null;
      for (const cat in CATALOG) {
        const item = CATALOG[cat].find(i => i.id === itemId);
        if (item) foundItem = item;
      }
      return { ...foundItem, quantity: qty };
    });

    const total = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const newOrder = {
      id: orderId,
      date: new Date().toISOString().split('T')[0],
      items: orderItems,
      total,
      status: 'PENDING'
    };

    setEnquiries(enquiries.map(enq => {
      if (enq.id.toString() === selectedSiteId) {
        const currentData = enq.siteData || {};
        return {
          ...enq,
          siteData: {
            ...currentData,
            ecommerceOrders: [newOrder, ...(currentData.ecommerceOrders || [])]
          }
        };
      }
      return enq;
    }));

    setCart({});
    alert(`Order ${orderId} placed successfully for site ${selectedSite.customerName}!`);
  };

  const handleUpdateOrderStatus = (siteId, orderId, newStatus) => {
    setEnquiries(enquiries.map(enq => {
      if (enq.id.toString() === siteId.toString()) {
        const orders = (enq.siteData?.ecommerceOrders || []).map(o => 
          o.id === orderId ? { ...o, status: newStatus } : o
        );
        return {
          ...enq,
          siteData: {
            ...enq.siteData,
            ecommerceOrders: orders
          }
        };
      }
      return enq;
    }));
  };

  const cartItems = Object.entries(cart).map(([itemId, qty]) => {
    let foundItem = null;
    for (const cat in CATALOG) {
      const item = CATALOG[cat].find(i => i.id === itemId);
      if (item) foundItem = item;
    }
    return { ...foundItem, quantity: qty };
  });
  const cartTotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const displaySites = selectedSiteId ? confirmedSites.filter(s => s.id.toString() === selectedSiteId) : confirmedSites;
  const orderHistory = displaySites.flatMap(s => (s.siteData?.ecommerceOrders || []).map(o => ({ ...o, siteName: s.customerName, ocNumber: s.ocNumber })));

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1.5rem' }}>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">Spare Parts Store</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
            Order replacement parts and consumables for deployed machines.
          </p>
        </div>
      </div>

      <div className="form-row" style={{ marginBottom: '1.5rem', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, maxWidth: '400px' }}>
          <label className="form-label">Select Site / Confirmed Order</label>
          <select 
            className="form-control" 
            value={selectedSiteId} 
            onChange={e => setSelectedSiteId(e.target.value)}
          >
            <option value="">-- Choose a deployed site --</option>
            {confirmedSites.map(s => (
              <option key={s.id} value={s.id}>
                {s.customerName} - OC: {s.ocNumber || 'N/A'} (DC: {s.siteData?.dcNumber || 'N/A'})
              </option>
            ))}
          </select>
        </div>
        {selectedSite && (
          <div style={{ padding: '0.5rem 1rem', background: '#F0FDF4', color: '#16A34A', borderRadius: '6px', fontWeight: 600, fontSize: '0.85rem' }}>
            Ordering for: {selectedSite.customerName}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <button
          onClick={() => setActiveTab('store')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 0',
            background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem',
            borderBottom: activeTab === 'store' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'store' ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'store' ? 700 : 500, whiteSpace: 'nowrap'
          }}
        >
          <ShoppingCart size={16} /> Store Catalog
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 0',
            background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem',
            borderBottom: activeTab === 'orders' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'orders' ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'orders' ? 700 : 500, whiteSpace: 'nowrap'
          }}
        >
          <List size={16} /> My Orders ({orderHistory.length})
        </button>
      </div>

      {activeTab === 'store' && (
        <div className="form-row" style={{ flex: 1, alignItems: 'flex-start' }}>
        
        {/* Accordion Catalog */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {Object.entries(CATALOG).map(([category, items]) => (
            <div key={category} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', overflow: 'hidden' }}>
              
              <button 
                onClick={() => setExpandedCategory(expandedCategory === category ? '' : category)}
                style={{ 
                  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '1rem', background: expandedCategory === category ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
                  border: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)', fontSize: '1rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Package size={18} color="var(--primary)" />
                  {category}
                </div>
                {expandedCategory === category ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              
              {expandedCategory === category && (
                <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1.5rem', background: '#F8FAFC' }}>
                  {items.map(item => (
                    <div key={item.id} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', flexDirection: 'column', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                      <img src={item.image} alt={item.name} style={{ width: '100%', height: '160px', objectFit: 'contain', marginBottom: '1rem', background: '#F1F5F9', borderRadius: 'var(--radius-sm)' }} />
                      <h4 style={{ fontSize: '1.05rem', marginBottom: '0.5rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>{item.name}</h4>
                      
                      <ul style={{ paddingLeft: '1.25rem', marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', flex: 1, margin: '0 0 1rem 0' }}>
                        {item.specs.map((spec, i) => <li key={i} style={{ marginBottom: '0.2rem' }}>{spec}</li>)}
                      </ul>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>${item.price.toFixed(2)}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px', background: item.stock > 10 ? '#F0FDF4' : '#FEF2F2', color: item.stock > 10 ? '#16A34A' : '#DC2626' }}>
                          {item.stock > 0 ? `${item.stock} in stock` : 'Out of Stock'}
                        </span>
                      </div>
                      
                      <button 
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '0.6rem' }}
                        onClick={() => handleAddToCart(item)}
                      >
                        <ShoppingCart size={16} /> Add to Cart
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Shopping Cart Sidebar */}
        <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', padding: '1.5rem', position: 'sticky', top: '1rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            <ShoppingCart size={18} /> Order Cart
          </h3>

          {cartItems.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>Your cart is empty.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              {cartItems.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>${item.price.toFixed(2)} each</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button className="btn-icon" style={{ padding: '0.2rem', border: '1px solid var(--border-color)' }} onClick={() => handleUpdateQuantity(item.id, -1)}>
                      <Minus size={12} />
                    </button>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>{item.quantity}</span>
                    <button className="btn-icon" style={{ padding: '0.2rem', border: '1px solid var(--border-color)' }} onClick={() => handleUpdateQuantity(item.id, 1)}>
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ borderTop: '2px dashed var(--border-color)', paddingTop: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.1rem' }}>
              <span>Total:</span>
              <span>${cartTotal.toFixed(2)}</span>
            </div>
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
            disabled={cartItems.length === 0 || !selectedSiteId}
            onClick={handlePlaceOrder}
          >
            <CreditCard size={18} /> Place Order
          </button>
          
          {!selectedSiteId && cartItems.length > 0 && (
            <p style={{ color: '#DC2626', fontSize: '0.75rem', textAlign: 'center', marginTop: '0.5rem', fontWeight: 600 }}>
              * Select a site/customer to place order
            </p>
          )}
        </div>
      </div>
      )}

      {activeTab === 'orders' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Site / Customer</th>
                <th>Date</th>
                <th>Items Ordered</th>
                <th>Total</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orderHistory.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No orders found.</td></tr>
              ) : orderHistory.map(order => (
                <tr key={order.id}>
                  <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{order.id}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{order.siteName}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{order.ocNumber}</div>
                  </td>
                  <td>{order.date}</td>
                  <td>
                    <div style={{ fontSize: '0.85rem' }}>
                      {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                    </div>
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--primary)' }}>${order.total.toFixed(2)}</td>
                  <td>
                    <span style={{ 
                      padding: '0.2rem 0.5rem', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 700,
                      background: order.status === 'PENDING' ? '#FEF3C7' : (order.status === 'APPROVED' ? '#DBEAFE' : (order.status === 'REJECTED' ? '#FEE2E2' : '#F0FDF4')),
                      color: order.status === 'PENDING' ? '#D97706' : (order.status === 'APPROVED' ? '#2563EB' : (order.status === 'REJECTED' ? '#B91C1C' : '#16A34A'))
                    }}>
                      {order.status}
                    </span>
                  </td>
                  <td>
                    {order.status === 'PENDING' ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-primary btn-small" style={{ background: '#16A34A' }} onClick={() => handleUpdateOrderStatus(order.siteId || orderHistory.find(o => o.id === order.id).siteId || confirmedSites.find(s => s.customerName === order.siteName).id, order.id, 'APPROVED')}>Approve</button>
                        <button className="btn btn-primary btn-small" style={{ background: '#DC2626' }} onClick={() => handleUpdateOrderStatus(confirmedSites.find(s => s.customerName === order.siteName).id, order.id, 'REJECTED')}>Reject</button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
