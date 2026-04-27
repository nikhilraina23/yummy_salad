// Test script for new bowl size functionality
async function testBowlSizes() {
  console.log('🧪 Testing Three Bowl Sizes...\n');
  
  const baseUrl = 'http://localhost:3000';
  
  // Test 1: Regular Bowl (₹29)
  console.log('\n1. Testing Regular Bowl (₹29)...');
  try {
    const regularOrder = {
      name: 'Test User',
      phone: '9876543210',
      location: 'Moinabad',
      address: 'Test Address',
      quantity: 2,
      bowlSize: 'regular',
      bowlPrice: 29,
      paymentMethod: 'cod',
      paymentProvider: 'cod'
    };
    
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(regularOrder)
    });
    
    if (res.ok) {
      const data = await res.json();
      console.log('✅ Regular bowl order successful:', data.order?.orderId);
      console.log('   - Expected total: ₹58 (2 × ₹29)');
      console.log('   - Actual total: ₹' + data.order?.total);
    } else {
      console.log('❌ Regular bowl order failed');
    }
  } catch (error) {
    console.log('❌ Regular bowl test error:', error.message);
  }
  
  // Test 2: Medium Bowl (₹49)
  console.log('\n2. Testing Medium Bowl (₹49)...');
  try {
    const mediumOrder = {
      name: 'Test User 2',
      phone: '9876543211',
      location: 'Gandipet',
      address: 'Test Address 2',
      quantity: 1,
      bowlSize: 'medium',
      bowlPrice: 49,
      paymentMethod: 'cod',
      paymentProvider: 'cod'
    };
    
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mediumOrder)
    });
    
    if (res.ok) {
      const data = await res.json();
      console.log('✅ Medium bowl order successful:', data.order?.orderId);
      console.log('   - Expected total: ₹49 (1 × ₹49)');
      console.log('   - Actual total: ₹' + data.order?.total);
    } else {
      console.log('❌ Medium bowl order failed');
    }
  } catch (error) {
    console.log('❌ Medium bowl test error:', error.message);
  }
  
  // Test 3: Large Bowl (₹99)
  console.log('\n3. Testing Large Bowl (₹99)...');
  try {
    const largeOrder = {
      name: 'Test User 3',
      phone: '9876543212',
      location: 'Kokapet',
      address: 'Test Address 3',
      quantity: 3,
      bowlSize: 'large',
      bowlPrice: 99,
      paymentMethod: 'cod',
      paymentProvider: 'cod'
    };
    
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(largeOrder)
    });
    
    if (res.ok) {
      const data = await res.json();
      console.log('✅ Large bowl order successful:', data.order?.orderId);
      console.log('   - Expected total: ₹297 (3 × ₹99)');
      console.log('   - Actual total: ₹' + data.order?.total);
    } else {
      console.log('❌ Large bowl order failed');
    }
  } catch (error) {
    console.log('❌ Large bowl test error:', error.message);
  }
  
  console.log('\n🎉 Bowl size testing complete!');
  console.log('\n📝 Manual Testing Checklist:');
  console.log('   - Open http://localhost:3000');
  console.log('   - Try ordering each bowl size');
  console.log('   - Check dynamic price calculation');
  console.log('   - Verify order creation success');
  console.log('   - Test admin dashboard visibility');
}

// Run tests
testBowlSizes();
