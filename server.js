import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as db from './database.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const razorpay = RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
  : null;

// ── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Rate Limiting ────────────────────────────────────────────────────────────
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  skipFailedRequests: true,
  message: { success: false, error: 'Too many order attempts. Please wait a minute and try again.' }
});

const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100
});

app.use('/api/', generalLimiter);

// ── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(join(__dirname, 'public')));

// ══════════════════════════════════════════════════════════════════════════════
//  API ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/orders  — Create order (COD or online)
app.post('/api/orders', orderLimiter, async (req, res) => {
  try {
    let body = req.body;
    
    // If express.json() failed to parse it, it might be a string
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }
    
    body = body || {};

    // Fallback for Netlify serverless environment if express.json() missed the payload
    if (Object.keys(body).length === 0 && req.apiGateway && req.apiGateway.event && req.apiGateway.event.body) {
      try {
        if (typeof req.apiGateway.event.body === 'object') {
          body = req.apiGateway.event.body;
        } else {
          const rawBody = req.apiGateway.event.isBase64Encoded 
            ? Buffer.from(req.apiGateway.event.body, 'base64').toString('utf8') 
            : req.apiGateway.event.body;
          body = JSON.parse(rawBody);
        }
      } catch (e) { console.error('Fallback parse error:', e); }
    }
    
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }

    const { name, phone, location, address, quantity, notes, bowlSize, bowlPrice, paymentMethod, paymentProvider, customerLat, customerLng } = body;

    const errors = {};
    if (!name || name.trim().length < 2) errors.name = 'Name must be at least 2 characters';
    if (!phone || !/^[6-9]\d{9}$/.test(phone.trim())) errors.phone = 'Enter a valid 10-digit Indian mobile number';
    if (!location || !['Moinabad', 'Gandipet', 'Kokapet'].includes(location)) errors.location = 'Select a valid delivery location';
    if (!address || address.trim().length < 5) errors.address = 'Please provide a detailed address';
    const method = (paymentMethod || '').toLowerCase();
    const provider = (paymentProvider || '').toLowerCase();
    if (!['online', 'cod'].includes(method)) {
      errors.paymentMethod = 'Select a valid payment method';
    }
    if (method === 'online' && !['upi', 'gpay', 'razorpay'].includes(provider)) {
      errors.paymentProvider = 'Please choose UPI, GPay, or Razorpay';
    }
    if (method === 'cod' && provider !== 'cod') {
      errors.paymentProvider = 'Payment provider must be COD';
    }
    const qty = parseInt(quantity) || 1;
    if (qty < 1 || qty > 20) errors.quantity = 'Quantity must be between 1 and 20';
    
    // Validate bowl size and price
    const validBowlSizes = ['regular', 'medium', 'large'];
    const validPrices = { regular: 29, medium: 49, large: 99 };
    
    if (!bowlSize || !validBowlSizes.includes(bowlSize)) {
      errors.bowlSize = 'Please select a valid bowl size';
    }
    
    const expectedPrice = validPrices[bowlSize];
    if (!bowlPrice || parseInt(bowlPrice) !== expectedPrice) {
      errors.bowlPrice = 'Invalid bowl price';
    }

    if (Object.keys(errors).length > 0) {
      // DEBUG: If validation fails, return the stringified body in the 'error' field so we can see what the backend received.
      return res.status(400).json({ 
        success: false, 
        error: "DEBUG_PAYLOAD: " + JSON.stringify(body),
        errors 
      });
    }
    if (method === 'online' && !razorpay) {
      return res.status(503).json({
        success: false,
        error: 'Online payment is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server environment.'
      });
    }

    const total = qty * parseInt(bowlPrice);
    
    // Create order with bowl size information
    const orderData = {
      name: name.trim(), 
      phone: phone.trim(), 
      location,
      address: address.trim(), 
      quantity: qty,
      bowlSize: bowlSize,
      bowlPrice: parseInt(bowlPrice),
      notes: (notes || '').trim(), 
      total,
      customerLat: parseFloat(customerLat) || null,
      customerLng: parseFloat(customerLng) || null
    };

    const orderId = await db.createOrder(orderData);

    if (method === 'cod') {
      await db.attachPaymentOrder(orderData.order_id, { paymentProvider: 'cod', razorpayOrderId: null });
      return res.status(201).json({
        success: true,
        message: 'Order created. Cash on Delivery selected.',
        order: {
          id: orderData.id,
          orderId: orderData.order_id,
          total: orderData.total,
          bowlSize: orderData.bowlSize,
          bowlPrice: orderData.bowlPrice,
          paymentMethod: 'cod',
          paymentProvider: 'cod',
          paymentStatus: 'pending',
          status: orderData.status,
          estimatedDelivery: '6 PM – 9 PM tomorrow'
        }
      });
    }

    const rpOrder = await razorpay.orders.create({
      amount: orderData.total * 100,
      currency: 'INR',
      receipt: orderData.order_id,
      notes: {
        order_id: order.order_id,
        name: order.name,
        phone: order.phone
      }
    });
    await db.attachPaymentOrder(order.order_id, { paymentProvider: provider, razorpayOrderId: rpOrder.id });

    res.status(201).json({
      success: true,
      message: 'Order created. Complete payment to confirm.',
      order: {
        id: orderData.id, orderId: orderData.order_id, total: orderData.total,
        bowlSize: orderData.bowlSize,
        bowlPrice: orderData.bowlPrice,
        paymentMethod: 'online',
        paymentProvider: provider,
        paymentStatus: 'pending',
        status: order.status, estimatedDelivery: '6 PM – 9 PM tomorrow'
      },
      payment: {
        keyId: RAZORPAY_KEY_ID,
        razorpayOrderId: rpOrder.id,
        amount: rpOrder.amount,
        currency: rpOrder.currency
      }
    });
  } catch (err) {
    console.error('Order error:', err);
    res.status(500).json({ success: false, error: 'Internal server error. Please try again.' });
  }
});

// POST /api/payments/verify  — Verify Razorpay payment signature and confirm order
app.post('/api/payments/verify', orderLimiter, async (req, res) => {
  try {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ success: false, error: 'Missing payment verification details' });
    }
    if (!RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ success: false, error: 'Payment verification is not configured' });
    }
    const expected = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    if (expected !== razorpaySignature) {
      return res.status(400).json({ success: false, error: 'Payment signature verification failed' });
    }

    const order = await db.getOrderByOrderId(orderId.toUpperCase());
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    if (order.razorpay_order_id !== razorpayOrderId) {
      return res.status(400).json({ success: false, error: 'Payment does not match this order' });
    }

    await db.markOrderPaid(order.order_id, { razorpayPaymentId });
    const updatedOrder = await db.getOrderByOrderId(order.order_id);
    res.json({
      success: true,
      message: 'Payment verified. Order confirmed.',
      order: {
        orderId: updatedOrder.order_id,
        total: updatedOrder.total,
        status: updatedOrder.status,
        paymentStatus: updatedOrder.payment_status,
        estimatedDelivery: '6 PM – 9 PM tomorrow'
      }
    });
  } catch (err) {
    console.error('Payment verify error:', err);
    res.status(500).json({ success: false, error: 'Unable to verify payment. Contact support with your order ID.' });
  }
});

// GET /api/orders/:orderId  — Track an order
app.get('/api/orders/:orderId', async (req, res) => {
  try {
    const order = await db.getOrderByOrderId(req.params.orderId.toUpperCase());
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({
      success: true,
      order: {
        orderId: order.order_id, name: order.name, location: order.location,
        quantity: order.quantity, total: order.total, status: order.status,
        paymentStatus: order.payment_status || 'pending',
        paymentProvider: order.payment_provider || '',
        createdAt: order.created_at,
        estimatedDelivery: '6 PM – 9 PM ' + (order.status === 'delivered' ? '(Delivered ✅)' : 'tomorrow')
      }
    });
  } catch (err) {
    console.error('Track error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/orders/:orderId/delivery-location  — Customer polls delivery person location
app.get('/api/orders/:orderId/delivery-location', async (req, res) => {
  try {
    const order = await db.getOrderByOrderId(req.params.orderId.toUpperCase());
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    if (order.status !== 'out_for_delivery') {
      return res.json({ success: false, error: 'Order is not out for delivery yet' });
    }
    const loc = await db.getDeliveryLocation(req.params.orderId.toUpperCase());
    if (!loc) return res.json({ success: false, error: 'Delivery location not shared yet' });
    res.json({ success: true, lat: loc.lat, lng: loc.lng, updatedAt: loc.updatedAt });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/stats  — Public stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN API ROUTES
// ══════════════════════════════════════════════════════════════════════════════
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'yummysalad-admin-2025';

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ success: false, error: 'Unauthorized' });
  next();
}

// GET /api/admin/orders
app.get('/api/admin/orders', adminAuth, async (req, res) => {
  try {
    const { status, location, date, page = 1, limit = 50 } = req.query;
    
    // Validate pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({ success: false, error: 'Invalid page number' });
    }
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({ success: false, error: 'Invalid limit (1-100)' });
    }
    
    const orders = await db.getAllOrders({ status, location, date, page: pageNum, limit: limitNum });
    const total  = await db.countOrders({ status, location, date });
    
    res.json({ 
      success: true, 
      orders: orders || [], 
      total: total || 0, 
      page: pageNum, 
      limit: limitNum 
    });
  } catch (err) {
    console.error('Admin list error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PATCH /api/admin/orders/:id/status
app.patch('/api/admin/orders/:id/status', adminAuth, async (req, res) => {
  try {
    let body = req.body || {};
    if (Object.keys(body).length === 0 && req.apiGateway && req.apiGateway.event && req.apiGateway.event.body) {
      try {
        if (typeof req.apiGateway.event.body === 'object') {
          body = req.apiGateway.event.body;
        } else {
          const rawBody = req.apiGateway.event.isBase64Encoded 
            ? Buffer.from(req.apiGateway.event.body, 'base64').toString('utf8') 
            : req.apiGateway.event.body;
          body = JSON.parse(rawBody);
        }
      } catch (e) {}
    }
    const { status } = body;
    const validStatuses = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    
    const orderId = req.params.id;
    if (!orderId || isNaN(orderId)) return res.status(400).json({ success: false, error: 'Invalid order ID' });
    
    const updated = await db.updateOrderStatus(orderId, status);
    if (!updated) return res.status(404).json({ success: false, error: 'Order not found' });
    
    // Auto-clear delivery location when order is delivered/cancelled
    if (status === 'delivered' || status === 'cancelled') {
      const order = await db.getOrderById(parseInt(orderId));
      if (order) await db.clearDeliveryLocation(order.order_id);
    }
    
    res.json({ success: true, message: 'Status updated', status });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/admin/orders/:orderId/delivery-location  — Admin shares their GPS live
app.post('/api/admin/orders/:orderId/delivery-location', adminAuth, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) return res.status(400).json({ success: false, error: 'lat and lng required' });
    
    const orderId = req.params.orderId;
    if (!orderId) return res.status(400).json({ success: false, error: 'Order ID required' });
    
    const order = await db.getOrderByOrderId(orderId.toUpperCase());
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    
    // Validate coordinates
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ success: false, error: 'Invalid coordinates' });
    }
    
    await db.setDeliveryLocation(orderId.toUpperCase(), latitude, longitude);
    res.json({ success: true, message: 'Location updated', lat: latitude, lng: longitude });
  } catch (err) {
    console.error('Delivery location update error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/admin/stats
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const stats = await db.getAdminStats();
    if (!stats) {
      return res.status(500).json({ success: false, error: 'Failed to generate statistics' });
    }
    res.json({ success: true, stats, paymentConfigured: !!razorpay });
  } catch (err) {
    console.error('Stats generation error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── SPA Fallback ─────────────────────────────────────────────────────────────
app.get('/admin', (req, res) => res.sendFile(join(__dirname, 'public', 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(join(__dirname, 'public', 'admin.html')));

// ── Start Server ─────────────────────────────────────────────────────────────
if (!process.env.NETLIFY) {
  app.listen(PORT, () => {
    console.log(`\n🥗 Yummy Salad server running on http://localhost:${PORT}`);
    console.log(`📊 Admin dashboard: http://localhost:${PORT}/admin.html`);
    console.log(`🔑 Admin token: ${ADMIN_TOKEN}`);
    console.log(`💳 Razorpay: ${razorpay ? 'configured' : 'missing keys (RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET)'}`);
    console.log(`📁 Data stored in: orders.json\n`);
  });
}

export default app;
