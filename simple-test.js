// Simple test for admin functionality
async function testAdmin() {
  console.log('🧪 Testing Admin Dashboard...\n');
  
  const baseUrl = 'http://localhost:3000';
  const token = 'yummysalad-admin-2025';
  
  try {
    // Test 1: Login (stats endpoint)
    console.log('1. Testing admin authentication...');
    const statsRes = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: { 'x-admin-token': token }
    });
    
    if (statsRes.ok) {
      const stats = await statsRes.json();
      console.log('✅ Authentication working');
      console.log(`   - Total orders: ${stats.stats.total}`);
      console.log(`   - Revenue: ₹${stats.stats.revenue}`);
    } else {
      console.log('❌ Authentication failed');
      return;
    }
    
    // Test 2: Orders list
    console.log('\n2. Testing orders list...');
    const ordersRes = await fetch(`${baseUrl}/api/admin/orders`, {
      headers: { 'x-admin-token': token }
    });
    
    if (ordersRes.ok) {
      const orders = await ordersRes.json();
      console.log('✅ Orders list working');
      console.log(`   - Found ${orders.orders.length} orders`);
    } else {
      console.log('❌ Orders list failed');
    }
    
    // Test 3: Status update
    if (ordersRes.ok) {
      const orders = await ordersRes.json();
      if (orders.orders.length > 0) {
        console.log('\n3. Testing status update...');
        const updateRes = await fetch(`${baseUrl}/api/admin/orders/${orders.orders[0].id}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-token': token
          },
          body: JSON.stringify({ status: 'confirmed' })
        });
        
        if (updateRes.ok) {
          console.log('✅ Status update working');
        } else {
          console.log('❌ Status update failed');
        }
      }
    }
    
    console.log('\n🎉 Admin backend tests complete!');
    console.log('\n📝 Frontend Testing:');
    console.log('   - Open http://localhost:3000/admin.html');
    console.log('   - Use token: yummysalad-admin-2025');
    console.log('   - Test all features manually in browser');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testAdmin();
