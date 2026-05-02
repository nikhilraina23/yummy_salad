import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

// ── Models ───────────────────────────────────────────────────────────────────

const counterSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const orderSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  order_id: { type: String, unique: true },
  name: String,
  phone: String,
  location: String,
  address: String,
  quantity: Number,
  bowlSize: { type: String, default: 'regular' },
  bowlPrice: { type: Number, default: 29 },
  total: Number,
  payment_method: { type: String, default: 'online' },
  payment_provider: String,
  payment_status: { type: String, default: 'pending' },
  razorpay_order_id: String,
  razorpay_payment_id: String,
  payment_paid_at: String,
  notes: String,
  status: { type: String, default: 'pending' },
  customer_lat: Number,
  customer_lng: Number,
  created_at: String,
  updated_at: String
});
const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

const deliveryLocationSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  lat: Number,
  lng: Number,
  updated_at: String
});
const DeliveryLocation = mongoose.models.DeliveryLocation || mongoose.model('DeliveryLocation', deliveryLocationSchema);

// ── Connection ───────────────────────────────────────────────────────────────

let isConnected = false;

export async function connectDb() {
  if (isConnected) return;
  if (!MONGODB_URI) {
    console.warn('⚠️ MONGODB_URI is not defined. Database operations will fail.');
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI);
    isConnected = true;
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
  }
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
  await connectDb();
  
  const counter = await Counter.findOneAndUpdate(
    { id: 'order_id' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  
  const id = counter.seq;
  const orderId = generateOrderId(id);
  
  const order = new Order({
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
  });
  
  await order.save();
  return order.toObject();
}

export async function getOrderById(id) {
  await connectDb();
  const order = await Order.findOne({ id: parseInt(id) });
  return order ? order.toObject() : null;
}

export async function getOrderByOrderId(orderId) {
  await connectDb();
  const order = await Order.findOne({ order_id: orderId });
  return order ? order.toObject() : null;
}

export async function getAllOrders({ status, location, date, page = 1, limit = 50 } = {}) {
  await connectDb();
  const query = {};
  if (status) query.status = status;
  if (location) query.location = location;
  if (date) query.created_at = { $regex: `^${date}` };
  
  const orders = await Order.find(query)
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
    
  return orders.map(o => o.toObject());
}

export async function countOrders({ status, location, date } = {}) {
  await connectDb();
  const query = {};
  if (status) query.status = status;
  if (location) query.location = location;
  if (date) query.created_at = { $regex: `^${date}` };
  
  return await Order.countDocuments(query);
}

export async function updateOrderStatus(id, status) {
  await connectDb();
  if (!id || isNaN(id)) return false;
  
  const result = await Order.updateOne(
    { id: parseInt(id) },
    { status, updated_at: now() }
  );
  return result.modifiedCount > 0;
}

export async function attachPaymentOrder(orderId, { paymentProvider, razorpayOrderId }) {
  await connectDb();
  const provider = paymentProvider || '';
  const result = await Order.updateOne(
    { order_id: orderId },
    { 
      payment_method: provider === 'cod' ? 'cod' : 'online',
      payment_provider: provider,
      razorpay_order_id: razorpayOrderId || null,
      updated_at: now()
    }
  );
  return result.modifiedCount > 0;
}

export async function markOrderPaid(orderId, { razorpayPaymentId }) {
  await connectDb();
  const result = await Order.updateOne(
    { order_id: orderId },
    { 
      payment_status: 'paid',
      razorpay_payment_id: razorpayPaymentId || null,
      payment_paid_at: now(),
      status: 'confirmed',
      updated_at: now()
    }
  );
  return result.modifiedCount > 0;
}

export async function setDeliveryLocation(orderId, lat, lng) {
  await connectDb();
  if (!orderId || typeof orderId !== 'string') return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  
  await DeliveryLocation.findOneAndUpdate(
    { orderId },
    { lat: parseFloat(lat), lng: parseFloat(lng), updated_at: now() },
    { upsert: true }
  );
  return true;
}

export async function getDeliveryLocation(orderId) {
  await connectDb();
  const loc = await DeliveryLocation.findOne({ orderId });
  if (!loc) return null;
  
  const updatedAtDate = new Date(loc.updated_at.replace(' ', 'T') + '+05:30');
  if (Date.now() - updatedAtDate.getTime() > 10 * 60 * 1000) return null;
  return loc.toObject();
}

export async function clearDeliveryLocation(orderId) {
  await connectDb();
  await DeliveryLocation.deleteOne({ orderId });
  return true;
}

export async function getStats() {
  await connectDb();
  const todayStr = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  
  const totalOrders = await Order.countDocuments({ status: { $ne: 'cancelled' } });
  const deliveredOrders = await Order.countDocuments({ status: 'delivered' });
  const todayOrders = await Order.countDocuments({ 
    status: { $ne: 'cancelled' },
    created_at: { $regex: `^${todayStr}` }
  });
  
  return { totalOrders, deliveredOrders, todayOrders };
}

export async function getAdminStats() {
  await connectDb();
  const todayStr = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() + 5.5*60*60*1000 - 7*24*60*60*1000).toISOString().slice(0,10);

  const orders = await Order.find({});
  
  const count = s => orders.filter(o => o.status === s).length;
  const revenue = orders.filter(o => !['cancelled','pending'].includes(o.status)).reduce((s,o) => s + (o.total || 0), 0);
  const todayRevenue = orders.filter(o => o.status !== 'cancelled' && o.created_at && o.created_at.startsWith(todayStr)).reduce((s,o) => s + (o.total || 0), 0);

  const locMap = {};
  orders.filter(o => o.status !== 'cancelled').forEach(o => { 
    if (o.location) {
      locMap[o.location] = (locMap[o.location] || 0) + 1; 
    }
  });
  const byLocation = Object.entries(locMap).map(([location, count]) => ({ location, count }));

  const weeklyMap = {};
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
}
