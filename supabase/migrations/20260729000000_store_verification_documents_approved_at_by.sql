-- Distinct from reviewed_at/reviewed_by (which update on every review action,
-- approve OR reject, and get wiped to NULL on every re-upload): approved_at/
-- approved_by only change on an actual approval, and are preserved through a
-- later re-upload or rejection — so "was this document ever approved, by
-- whom, and when" isn't lost just because it was later re-uploaded and is
-- currently pending/rejected again. Re-approving after a re-upload updates
-- both to the new approval's admin and time.

ALTER TABLE public.store_verification_documents
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.admins(id);

COMMENT ON COLUMN public.store_verification_documents.approved_at IS
  'When this document was last approved. Unlike reviewed_at, not cleared by a '
  'later re-upload or rejection — only updated by a new approval.';
COMMENT ON COLUMN public.store_verification_documents.approved_by IS
  'Which admin last approved this document. Preserved through later re-uploads/rejections.';
