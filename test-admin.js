// Test script for admin dashboard functionality
const ADMIN_TOKEN = 'yummysalad-admin-2025';

async function testAPI() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('🧪 Testing Admin API Endpoints...\n');
  
  try {
    // Test 1: Get admin stats
    console.log('1. Testing /api/admin/stats...');
    const statsResponse = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: { 'x-admin-token': ADMIN_TOKEN }
    });
    const statsData = await statsResponse.json();
    console.log('Status:', statsResponse.status);
    console.log('Data:', JSON.stringify(statsData, null, 2));
    
    if (statsData.success) {
      console.log('✅ Stats endpoint working\n');
    } else {
      console.log('❌ Stats endpoint failed\n');
    }
    
    // Test 2: Get orders
    console.log('2. Testing /api/admin/orders...');
    const ordersResponse = await fetch(`${baseUrl}/api/admin/orders`, {
      headers: { 'x-admin-token': ADMIN_TOKEN }
    });
    const ordersData = await ordersResponse.json();
    console.log('Status:', ordersResponse.status);
    console.log('Orders count:', ordersData.orders?.length || 0);
    
    if (ordersData.success) {
      console.log('✅ Orders endpoint working\n');
    } else {
      console.log('❌ Orders endpoint failed\n');
    }
    
    // Test 3: Update order status (if there are orders)
    if (ordersData.success && ordersData.orders?.length > 0) {
      console.log('3. Testing order status update...');
      const firstOrder = ordersData.orders[0];
      const updateResponse = await fetch(`${baseUrl}/api/admin/orders/${firstOrder.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': ADMIN_TOKEN
        },
        body: JSON.stringify({ status: 'confirmed' })
      });
      const updateData = await updateResponse.json();
      console.log('Status:', updateResponse.status);
      console.log('Response:', JSON.stringify(updateData, null, 2));
      
      if (updateData.success) {
        console.log('✅ Status update working\n');
      } else {
        console.log('❌ Status update failed\n');
      }
    }
    
    console.log('🎉 Admin API testing complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run tests if this file is executed directly
if (typeof window === 'undefined') {
  testAPI();
}
