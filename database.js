import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Modify path for Netlify's ephemeral /tmp storage if running on Netlify
let file = join(__dirname, 'orders.json');
if (process.env.NETLIFY) {
  file = '/tmp/orders.json';
  if (!fs.existsSync(file) && fs.existsSync(join(__dirname, 'orders.json'))) {
    fs.copyFileSync(join(__dirname, 'orders.json'), file);
  }
}

const adapter = new JSONFile(file);

// ── In-house singleton ───────────────────────────────────────────────────────
let _db = null;

async function getDb() {
  if (_db) return _db;
  _db = new Low(adapter, { orders: [], counter: 0, deliveryLocations: {} });
  await _db.read();
  // Migrate: ensure deliveryLocations key exists
  if (!_db.data.deliveryLocations) _db.data.deliveryLocations = {};
  return _db;
}

// ── Helper: generate friendly order ID ──────────────────────────────────────
function generateOrderId(counter) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  let n = counter;
  for (let i = 0; i < 6; i++) { suffix = chars[n % chars.length] + suffix; n = Math.floor(n / chars.length); }
  return 'YS-' + suffix;
}

// ── IST timestamp ──────────────────────────────────────────────────────────
function now() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createOrder({ name, phone, location, address, quantity, notes, total, customerLat, customerLng, bowlSize, bowlPrice }) {
  const db = await getDb();
  db.data.counter = (db.data.counter || 0) + 1;
  const id = db.data.counter;
  const orderId = generateOrderId(id);
  const order = {
    id, order_id: orderId, name, phone, location, address, quantity: parseInt(quantity),
    bowlSize: bowlSize || 'regular',
    bowlPrice: parseInt(bowlPrice) || 29,
    total: parseFloat(total),
    payment_method: 'online',
    payment_provider: '',
    payment_status: 'pending',
    razorpay_order_id: null,
    razorpay_payment_id: null,
    payment_paid_at: null,
    notes: notes || '', status: 'pending',
    customer_lat: customerLat || null,
    customer_lng: customerLng || null,
    created_at: now(), updated_at: now()
  };
    db.data.orders.push(order);
    await db.write();
    return order;
}

export async function getOrderById(id) {
  const db = await getDb();
  return db.data.orders.find(o => o.id === id) || null;
}

export async function getOrderByOrderId(orderId) {
  const db = await getDb();
  return db.data.orders.find(o => o.order_id === orderId) || null;
}

export async function getAllOrders({ status, location, date, page = 1, limit = 50 } = {}) {
  const db = await getDb();
  let orders = [...db.data.orders];
  if (status)   orders = orders.filter(o => o.status === status);
  if (location) orders = orders.filter(o => o.location === location);
  if (date)     orders = orders.filter(o => o.created_at.startsWith(date));
  orders.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return orders.slice((page - 1) * limit, page * limit);
}

export async function countOrders({ status, location, date } = {}) {
  const db = await getDb();
  let orders = db.data.orders;
  if (status)   orders = orders.filter(o => o.status === status);
  if (location) orders = orders.filter(o => o.location === location);
  if (date)     orders = orders.filter(o => o.created_at.startsWith(date));
  return orders.length;
}

export async function updateOrderStatus(id, status) {
  const db = await getDb();
  
  // Validate ID and status
  if (!id || isNaN(id)) return false;
  if (!status || typeof status !== 'string') return false;
  
  const order = db.data.orders.find(o => o.id === parseInt(id));
  if (!order) return false;
  
  order.status = status;
  order.updated_at = now();
  try {
    await db.write();
    return true;
  } catch (error) {
    console.error('Failed to update order status:', error);
    return false;
  }
}

export async function attachPaymentOrder(orderId, { paymentProvider, razorpayOrderId }) {
  const db = await getDb();
  const order = db.data.orders.find(o => o.order_id === orderId);
  if (!order) return false;
  const provider = paymentProvider || '';
  order.payment_method = provider === 'cod' ? 'cod' : 'online';
  order.payment_provider = provider;
  order.razorpay_order_id = razorpayOrderId || null;
  order.updated_at = now();
  await db.write();
  return true;
}

export async function markOrderPaid(orderId, { razorpayPaymentId }) {
  const db = await getDb();
  const order = db.data.orders.find(o => o.order_id === orderId);
  if (!order) return false;
  order.payment_status = 'paid';
  order.razorpay_payment_id = razorpayPaymentId || null;
  order.payment_paid_at = now();
  order.status = 'confirmed';
  order.updated_at = now();
  await db.write();
  return true;
}

// ── Delivery Person Location (admin pushes, customer polls) ─────────────────

export async function setDeliveryLocation(orderId, lat, lng) {
  const db = await getDb();
  
  // Validate inputs
  if (!orderId || typeof orderId !== 'string') return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  
  if (!db.data.deliveryLocations) db.data.deliveryLocations = {};
  
  db.data.deliveryLocations[orderId] = {
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    updated_at: now()
  };
  
  try {
    await db.write();
    return true;
  } catch (error) {
    console.error('Failed to set delivery location:', error);
    return false;
  }
}

export async function getDeliveryLocation(orderId) {
  const db = await getDb();
  const loc = (db.data.deliveryLocations || {})[orderId];
  if (!loc) return null;
  // Expire after 10 minutes of no update
  if (Date.now() - loc.updatedAt > 10 * 60 * 1000) return null;
  return loc;
}

export async function clearDeliveryLocation(orderId) {
  const db = await getDb();
  if (db.data.deliveryLocations) {
    delete db.data.deliveryLocations[orderId];
    await db.write();
  }
  return true;
}

// ── Stats ────────────────────────────────────────────────────────────────────

export async function getStats() {
  const db = await getDb();
  const todayStr = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    totalOrders:  db.data.orders.filter(o => o.status !== 'cancelled').length,
    deliveredOrders: db.data.orders.filter(o => o.status === 'delivered').length,
    todayOrders:  db.data.orders.filter(o => o.status !== 'cancelled' && o.created_at.startsWith(todayStr)).length
  };
}

export async function getAdminStats() {
  try {
    const db = await getDb();
    if (!db || !db.data || !Array.isArray(db.data.orders)) {
      throw new Error('Invalid database structure');
    }
    
    const orders = db.data.orders;
    const todayStr = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const count = s => orders.filter(o => o.status === s).length;
    const revenue = orders.filter(o => !['cancelled','pending'].includes(o.status)).reduce((s,o) => s + (o.total || 0), 0);
    const todayRevenue = orders.filter(o => o.status !== 'cancelled' && o.created_at && o.created_at.startsWith(todayStr)).reduce((s,o) => s + (o.total || 0), 0);

    // By location
    const locMap = {};
    orders.filter(o => o.status !== 'cancelled').forEach(o => { 
      if (o.location) {
        locMap[o.location] = (locMap[o.location] || 0) + 1; 
      }
    });
    const byLocation = Object.entries(locMap).map(([location, count]) => ({ location, count }));

    // Last 7 days
    const weeklyMap = {};
    const sevenDaysAgo = new Date(Date.now() + 5.5*60*60*1000 - 7*24*60*60*1000).toISOString().slice(0,10);
    orders.filter(o => o.status !== 'cancelled' && o.created_at && o.created_at >= sevenDaysAgo).forEach(o => {
      const day = o.created_at.slice(0, 10);
      if (!weeklyMap[day]) weeklyMap[day] = { day, orders: 0, revenue: 0 };
      weeklyMap[day].orders++;
      weeklyMap[day].revenue += (o.total || 0);
    });
    const weeklyData = Object.values(weeklyMap).sort((a, b) => a.day.localeCompare(b.day));

    return {
      total: orders.length,
      pending: count('pending'),
      confirmed: count('confirmed'),
      preparing: count('preparing'),
      outForDelivery: count('out_for_delivery'),
      delivered: count('delivered'),
      cancelled: count('cancelled'),
      revenue, 
      todayRevenue, 
      byLocation, 
      weeklyData
    };
  } catch (error) {
    console.error('Error generating admin stats:', error);
    throw error;
  }
}
