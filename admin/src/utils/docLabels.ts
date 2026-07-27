/**
 * Human-readable labels for verification doc types, covering both stores'
 * and riders' doc_type vocabularies (see StoresPage.tsx / DeliveryDocumentReviewModal.tsx,
 * which each keep their own copy scoped to just their own doc types).
 */
export const DOC_TYPE_LABELS: Record<string, string> = {
  aadhaar_front: 'Aadhaar Card (Front)',
  aadhaar_back: 'Aadhaar Card (Back)',
  pan_front: 'PAN Card (Front)',
  pan_back: 'PAN Card (Back)',
  trade: 'Trade License',
  gst: 'GST Certificate',
  fssai: 'FSSAI License',
  driving_license_front: 'Driving License (Front)',
  driving_license_back: 'Driving License (Back)',
  vehicle_registration: 'Vehicle Registration (RC)',
};

export function docTypeLabel(docType: string): string {
  return DOC_TYPE_LABELS[docType] || docType;
}
