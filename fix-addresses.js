// Fix Address Newlines in localStorage
// Copy and paste this entire script into your browser console (F12) and press Enter

(function() {
  console.log('🔧 Starting address cleanup...');
  
  function cleanAddress(address) {
    if (!address) return address;
    
    let cleaned = address;
    
    // Replace literal backslash-n (stored as string)
    cleaned = cleaned.split('\\n').join(' ');
    cleaned = cleaned.split('\\r').join(' ');
    
    // Replace actual newline characters
    cleaned = cleaned.replace(/\n/g, ' ');
    cleaned = cleaned.replace(/\r/g, ' ');
    cleaned = cleaned.replace(/\t/g, ' ');
    
    // Replace multiple spaces with single space
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }
  
  // Fix current location
  try {
    const currentLocationStr = localStorage.getItem('currentLocation');
    if (currentLocationStr) {
      const currentLocation = JSON.parse(currentLocationStr);
      const originalAddress = currentLocation.address;
      currentLocation.address = cleanAddress(currentLocation.address);
      localStorage.setItem('currentLocation', JSON.stringify(currentLocation));
      console.log('✅ Fixed current location:');
      console.log('   Before:', originalAddress);
      console.log('   After:', currentLocation.address);
    } else {
      console.log('ℹ️ No current location found');
    }
  } catch (e) {
    console.error('❌ Error fixing current location:', e);
  }
  
  // Fix saved addresses
  try {
    const savedAddressesStr = localStorage.getItem('savedAddresses');
    if (savedAddressesStr) {
      const savedAddresses = JSON.parse(savedAddressesStr);
      let fixedCount = 0;
      
      savedAddresses.forEach((addr, index) => {
        const originalAddress = addr.address;
        addr.address = cleanAddress(addr.address);
        if (originalAddress !== addr.address) {
          fixedCount++;
          console.log(`✅ Fixed saved address ${index + 1}:`);
          console.log('   Before:', originalAddress);
          console.log('   After:', addr.address);
        }
      });
      
      localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
      console.log(`✅ Fixed ${fixedCount} saved address(es)`);
    } else {
      console.log('ℹ️ No saved addresses found');
    }
  } catch (e) {
    console.error('❌ Error fixing saved addresses:', e);
  }
  
  console.log('🎉 Address cleanup complete! Refreshing page...');
  
  // Reload the page after a short delay
  setTimeout(() => {
    location.reload();
  }, 1000);
})();
