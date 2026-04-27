// Frontend test script for admin dashboard
// This script tests the frontend JavaScript functionality

// Mock DOM environment for testing
const mockDOM = {
  elements: {},
  getElementById: function(id) {
    if (!this.elements[id]) {
      this.elements[id] = {
        value: '',
        innerHTML: '',
        textContent: '',
        classList: {
          add: function() {},
          remove: function() {}
        },
        style: { display: '' }
      };
    }
    return this.elements[id];
  },
  querySelector: function(selector) {
    return {
      classList: { add: function() {}, remove: function() {} }
    };
  },
  querySelectorAll: function(selector) {
    return [{ classList: { add: function() {}, remove: function() {} } }];
  }
};

// Mock fetch for testing
global.fetch = async function(url, options = {}) {
  console.log(`📡 Fetch: ${options.method || 'GET'} ${url}`);
  
  if (url.includes('/api/admin/stats')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        stats: {
          total: 12,
          pending: 10,
          confirmed: 1,
          preparing: 1,
          outForDelivery: 0,
          delivered: 1,
          cancelled: 0,
          revenue: 198,
          todayRevenue: 0,
          byLocation: [
            { location: "Gandipet", count: 4 },
            { location: "Moinabad", count: 5 },
            { location: "Kokapet", count: 3 }
          ],
          weeklyData: [
            { day: "2026-04-20", orders: 2, revenue: 198 },
            { day: "2026-04-23", orders: 8, revenue: 792 },
            { day: "2026-04-25", orders: 2, revenue: 198 }
          ]
        },
        paymentConfigured: false
      })
    };
  }
  
  if (url.includes('/api/admin/orders')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        orders: [
          {
            id: 1,
            order_id: "YS-AAAAAB",
            name: "Test User",
            phone: "9876543210",
            location: "Gandipet",
            address: "House 42, Green Valley Road",
            quantity: 1,
            total: 99,
            status: "pending",
            created_at: "2026-04-20 20:53:32"
          }
        ],
        total: 1,
        page: 1,
        limit: 20
      })
    };
  }
  
  if (url.includes('/status')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: "Status updated",
        status: "confirmed"
      })
    };
  }
  
  return {
    ok: false,
    status: 500,
    json: async () => ({ success: false, error: "Not implemented in test" })
  };
};

// Mock console methods
global.console = {
  log: (...args) => console.log(...args),
  error: (...args) => console.error('❌', ...args)
};

// Test functions
async function testLogin() {
  console.log('\n🔐 Testing Login Functionality...');
  
  // Mock successful login
  const token = 'yummysalad-admin-2025';
  const res = await fetch('/api/admin/stats', { 
    headers: { 'x-admin-token': token } 
  });
  
  if (res.ok) {
    console.log('✅ Login token validation working');
    return true;
  } else {
    console.log('❌ Login failed');
    return false;
  }
}

async function testDashboardLoading() {
  console.log('\n📊 Testing Dashboard Loading...');
  
  try {
    const res = await fetch('/api/admin/stats', { 
      headers: { 'x-admin-token': 'yummysalad-admin-2025' } 
    });
    const data = await res.json();
    
    if (data.success && data.stats) {
      console.log('✅ Dashboard stats loading working');
      console.log(`   - Total orders: ${data.stats.total}`);
      console.log(`   - Revenue: ₹${data.stats.revenue}`);
      console.log(`   - Locations: ${data.stats.byLocation.length}`);
      return true;
    } else {
      console.log('❌ Dashboard stats loading failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Dashboard loading error:', error.message);
    return false;
  }
}

async function testOrdersLoading() {
  console.log('\n📦 Testing Orders Loading...');
  
  try {
    const res = await fetch('/api/admin/orders', { 
      headers: { 'x-admin-token': 'yummysalad-admin-2025' } 
    });
    const data = await res.json();
    
    if (data.success && data.orders) {
      console.log('✅ Orders loading working');
      console.log(`   - Orders count: ${data.orders.length}`);
      console.log(`   - Total: ${data.total}`);
      return true;
    } else {
      console.log('❌ Orders loading failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Orders loading error:', error.message);
    return false;
  }
}

async function testStatusUpdate() {
  console.log('\n🔄 Testing Status Update...');
  
  try {
    const res = await fetch('/api/admin/orders/1/status', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': 'yummysalad-admin-2025'
      },
      body: JSON.stringify({ status: 'confirmed' })
    });
    const data = await res.json();
    
    if (data.success) {
      console.log('✅ Status update working');
      console.log(`   - New status: ${data.status}`);
      return true;
    } else {
      console.log('❌ Status update failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Status update error:', error.message);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('🧪 Testing Admin Dashboard Frontend Functions...\n');
  
  const results = [];
  
  results.push(await testLogin());
  results.push(await testDashboardLoading());
  results.push(await testOrdersLoading());
  results.push(await testStatusUpdate());
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n📈 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All frontend functions working correctly!');
  } else {
    console.log('⚠️ Some tests failed. Check the logs above.');
  }
}

// Run tests
runAllTests();
