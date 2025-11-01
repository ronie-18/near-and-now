# Form Fields Reference Guide

## Add Product Form

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│ Product Name *                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ e.g., Organic Basmati Rice                              │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Category *              │ Price (₹) *                       │
│ ┌─────────────────────┐ │ ┌─────────────────────────────┐ │
│ │ [Dropdown]          │ │ │ 0.00                        │ │
│ └─────────────────────┘ │ └─────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Original Price (₹)      │ Rating (0-5)                      │
│ ┌─────────────────────┐ │ ┌─────────────────────────────┐ │
│ │ 0.00 (Optional)     │ │ │ 4.5                         │ │
│ └─────────────────────┘ │ └─────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Size (Optional)         │ Weight (Optional)                 │
│ ┌─────────────────────┐ │ ┌─────────────────────────────┐ │
│ │ e.g., 1kg, 500g     │ │ │ e.g., 1kg, 500g             │ │
│ └─────────────────────┘ │ └─────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Image URL (Optional)                                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ https://example.com/image.jpg                           │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Description (Optional)                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │                                                         │ │
│ │ Enter product description...                            │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ☑ Product is in stock                                       │
├─────────────────────────────────────────────────────────────┤
│                                    [Cancel] [Create Product]│
└─────────────────────────────────────────────────────────────┘
```

### Field Details

| Field | Type | Required | Validation | Example |
|-------|------|----------|------------|---------|
| Product Name | Text | ✅ Yes | Non-empty | "Organic Basmati Rice" |
| Category | Dropdown | ✅ Yes | Must select | "rice", "vegetables" |
| Price | Number | ✅ Yes | > 0 | 245.00 |
| Original Price | Number | ❌ No | > 0 | 300.00 |
| Rating | Number | ❌ No | 0-5 | 4.5 |
| Size | Text | ❌ No | Any | "1kg", "500g", "Large" |
| Weight | Text | ❌ No | Any | "1kg", "500g" |
| Image URL | URL | ❌ No | Valid URL | "https://..." |
| Description | Textarea | ❌ No | Any | "Premium quality rice..." |
| In Stock | Checkbox | ❌ No | Boolean | true/false |

---

## Add Category Form

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│ Category Name *                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ e.g., Vegetables, Fruits, Dairy                         │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Status *                │ ☐ Mark as Featured                │
│ ┌─────────────────────┐ │                                   │
│ │ [Active/Inactive]   │ │                                   │
│ └─────────────────────┘ │                                   │
├─────────────────────────────────────────────────────────────┤
│ Image URL (Optional)                                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ https://example.com/category-image.jpg                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│ Enter a URL for the category image                         │
├─────────────────────────────────────────────────────────────┤
│ Description (Optional)                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │                                                         │ │
│ │ Enter category description...                           │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                                   [Cancel] [Create Category]│
└─────────────────────────────────────────────────────────────┘
```

### Field Details

| Field | Type | Required | Validation | Example |
|-------|------|----------|------------|---------|
| Category Name | Text | ✅ Yes | Non-empty | "Vegetables" |
| Status | Dropdown | ✅ Yes | Active/Inactive | "Active" |
| Featured | Checkbox | ❌ No | Boolean | true/false |
| Image URL | URL | ❌ No | Valid URL | "https://..." |
| Description | Textarea | ❌ No | Any | "Fresh vegetables..." |

---

## Example Data

### Sample Product
```json
{
  "name": "Aravalli Dubar Basmati Rice",
  "category": "rice",
  "price": 245,
  "original_price": 300,
  "rating": 4.8,
  "size": "5 Kg",
  "weight": "5kg",
  "image_url": "https://example.com/rice.jpg",
  "description": "Premium quality basmati rice",
  "in_stock": true
}
```

### Sample Category
```json
{
  "name": "vegetables",
  "status": "Active",
  "featured": true,
  "image": "https://example.com/vegetables.jpg",
  "description": "Fresh vegetables delivered daily"
}
```

---

## Validation Rules

### Product Validation
- ✅ Name must not be empty
- ✅ Price must be a positive number
- ✅ Category must be selected from existing categories
- ✅ Original price (if provided) should be >= price
- ✅ Rating (if provided) must be between 0 and 5
- ✅ Image URL (if provided) must be valid URL format

### Category Validation
- ✅ Name must not be empty
- ✅ Status must be either "Active" or "Inactive"
- ✅ Image URL (if provided) must be valid URL format

---

## Success Flow

1. User fills form
2. Clicks "Create Product" or "Create Category"
3. Form validates
4. Loading spinner shows
5. Data sent to Supabase
6. Success message displays
7. Auto-redirect after 1.5 seconds
8. New item appears in list

## Error Handling

- Missing required fields → Red error message
- Invalid data format → Specific validation error
- Database error → Generic error message with dismiss option
- Network error → Error message with retry suggestion
