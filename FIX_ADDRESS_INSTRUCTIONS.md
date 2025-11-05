# Fix Address Display Issue - Instructions

## Problem
The location selector is showing "401 \n Address..." instead of "401 Address..."

## Solution Applied
I've updated both `Header.tsx` and `LocationPicker.tsx` to properly handle and remove newline characters (both literal `\n` strings and actual newline characters).

## To Fix Your Existing Saved Data

You have 2 options:

### Option 1: Quick Console Fix (RECOMMENDED)
1. Open your website in the browser
2. Press `F12` to open Developer Console
3. Go to the "Console" tab
4. Copy and paste this code and press Enter:

```javascript
// Clean address function
function cleanAddress(addr) {
  if (!addr) return addr;
  let c = addr;
  c = c.split('\\n').join(' ');
  c = c.split('\\r').join(' ');
  c = c.replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ');
  c = c.replace(/\s+/g, ' ').trim();
  return c;
}

// Fix current location
const curr = localStorage.getItem('currentLocation');
if (curr) {
  const loc = JSON.parse(curr);
  console.log('Before:', loc.address);
  loc.address = cleanAddress(loc.address);
  console.log('After:', loc.address);
  localStorage.setItem('currentLocation', JSON.stringify(loc));
}

// Fix saved addresses
const saved = localStorage.getItem('savedAddresses');
if (saved) {
  const addrs = JSON.parse(saved);
  addrs.forEach(a => { a.address = cleanAddress(a.address); });
  localStorage.setItem('savedAddresses', JSON.stringify(addrs));
}

console.log('✅ Fixed! Reloading...');
setTimeout(() => location.reload(), 500);
```

### Option 2: Clear and Re-select
1. Open Developer Console (F12)
2. Run this command:
```javascript
localStorage.removeItem('currentLocation');
localStorage.removeItem('savedAddresses');
location.reload();
```
3. Select your location again - it will now be saved without newlines

## What Was Changed

### Header.tsx
- Updated `formatAddressLines()` function to use `.split('\\n').join(' ')` method
- This handles literal backslash-n strings that appear in the data
- Also handles actual newline characters, tabs, and carriage returns

### LocationPicker.tsx
- Updated `parseGooglePlace()` function with the same robust cleaning
- New addresses selected will automatically be saved clean

## Verification
After running the fix, you should see:
- ✅ "401 Address..." (correct)
- ❌ NOT "401 \n Address..." (incorrect)

The address will display on a single line with proper truncation if too long.
