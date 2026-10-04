import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ImageOff, Layers, RefreshCw, Save } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  EmptyState,
  FormField,
  Input,
  LinkButton,
  PageHeader,
  PageLoader,
  Textarea,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { getCategoryById, updateCategory } from '../../services/adminService';

interface CategoryFormData {
  name: string;
  description: string;
  image_url: string;
  display_order: string;
}

type FieldErrors = Partial<Record<'name' | 'image_url' | 'display_order', string>>;

const EMPTY_FORM: CategoryFormData = {
  name: '',
  description: '',
  image_url: '',
  display_order: '',
};

/**
 * Payload sent to updateCategory. JSON serialisation drops `undefined` keys, so
 * a cleared field used to be silently dropped from the update and the old
 * value survived. Explicit nulls clear the nullable columns; the Category type
 * accepts them directly.
 */
interface CategoryUpdatePayload {
  name: string;
  description: string | null;
  image_url: string | null;
  display_order: number | null;
}

function getErrorMessage(err: unknown, fallback: string): string {
  // PostgREST errors from supabase-js are plain objects, not Error instances.
  const code = (err as { code?: unknown } | null)?.code;
  if (code === '23505') {
    // categories_name_key UNIQUE (name), baseline migration 20260813000000.
    return 'A category with this name already exists.';
  }
  if (code === 'PGRST116') {
    // .update().single() matched no row: the category was deleted (or renamed
    // away) after this form loaded.
    return 'This category no longer exists. Go back to the list and refresh.';
  }
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const EditCategoryPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [imageError, setImageError] = useState(false);
  const [formData, setFormData] = useState<CategoryFormData>(EMPTY_FORM);

  useEffect(() => {
    // Cancellation guard: if the id changes or the page unmounts before the
    // request resolves, a stale response must not overwrite the form.
    let cancelled = false;

    const fetchCategory = async () => {
      if (!id) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);
      setNotFound(false);
      // A submit error or field errors from a previous id / attempt must not
      // survive into the freshly loaded form.
      setError(null);
      setFieldErrors({});

      try {
        const category = await getCategoryById(id);
        if (cancelled) return;

        if (!category) {
          setNotFound(true);
          return;
        }

        setFormData({
          name: category.name || '',
          description: category.description || '',
          image_url: category.image_url || '',
          // Explicit null check rather than `||`: a display_order of 0 (the
          // column default) is a real value and must not render as blank.
          display_order: category.display_order == null ? '' : String(category.display_order),
        });
        setImageError(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Error fetching category:', err);
        setLoadError('Failed to load category. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCategory();

    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  // Field names stay equal to the formData keys: this writes by e.target.name.
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => (prev[name as keyof FieldErrors] ? { ...prev, [name]: undefined } : prev));
    if (name === 'image_url') setImageError(false);
  };

  const validate = (): { errors: FieldErrors; displayOrder: number | null } => {
    const errors: FieldErrors = {};

    if (!formData.name.trim()) {
      errors.name = 'Category name is required.';
    }

    const imageUrl = formData.image_url.trim();
    if (imageUrl && !isHttpUrl(imageUrl)) {
      errors.image_url = 'Enter a full URL starting with http:// or https://.';
    }

    // Number() instead of parseInt so "1.5" or "3abc" are rejected rather than
    // silently truncated; min="0" on the input is only advisory.
    let displayOrder: number | null = null;
    const rawOrder = formData.display_order.trim();
    if (rawOrder !== '') {
      const parsed = Number(rawOrder);
      if (!Number.isInteger(parsed) || parsed < 0) {
        errors.display_order = 'Display order must be a whole number of 0 or more.';
      } else {
        displayOrder = parsed;
      }
    }

    return { errors, displayOrder };
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!id || saving) return;

    setError(null);

    const { errors, displayOrder } = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    const payload: CategoryUpdatePayload = {
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      image_url: formData.image_url.trim() || null,
      display_order: displayOrder,
    };

    try {
      setSaving(true);

      const result = await updateCategory(id, payload);

      if (!result) {
        setError('Failed to update category. Please try again.');
        return;
      }

      // Navigate immediately and confirm with a toast. The old 1.5s success
      // banner left the form enabled and submittable while the redirect timer
      // was pending, and the timer was never cleared.
      showToast('Category updated', 'success');
      navigate('/categories');
    } catch (err) {
      console.error('Error updating category:', err);
      setError(getErrorMessage(err, 'An error occurred while updating the category.'));
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <PageHeader
      title="Edit category"
      description="Update the category name, description, image and display order."
      backTo="/categories"
      backLabel="Back to categories"
    />
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <PageLoader label="Loading category…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        {header}
        <Alert
          tone="danger"
          title="Could not load category"
          actions={
            <>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCw />}
                onClick={() => setReloadKey((key) => key + 1)}
              >
                Retry
              </Button>
              <LinkButton to="/categories" variant="secondary" size="sm">
                Back to categories
              </LinkButton>
            </>
          }
        >
          {loadError}
        </Alert>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          {/* getCategoryById returns null only for PGRST116 (no such row) and
              throws for every other failure, which the loadError branch above
              handles with a Retry. A missing row is final, so no Retry here. */}
          <EmptyState
            icon={Layers}
            title="Category not found"
            description={
              id
                ? 'This category may have been deleted. The list shows the current categories.'
                : 'No category ID was provided in the address.'
            }
            action={
              <LinkButton to="/categories" variant="secondary">
                Back to categories
              </LinkButton>
            }
          />
        </Card>
      </div>
    );
  }

  const previewUrl = formData.image_url.trim();

  return (
    <div className="space-y-6">
      {header}

      <div className="max-w-3xl space-y-6">
        {error ? (
          <Alert tone="danger" title="Could not update category" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <Card>
            <CardHeader
              title="Category information"
              description="The name is shown to customers across the storefront."
            />
            <CardBody className="grid gap-5">
              <FormField label="Category name" htmlFor="name" required error={fieldErrors.name}>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  invalid={Boolean(fieldErrors.name)}
                  placeholder="e.g. Vegetables, Fruits, Dairy"
                />
              </FormField>

              <FormField
                label="Description"
                htmlFor="description"
                hint="Shown under the category name on the storefront."
              >
                <Textarea
                  id="description"
                  name="description"
                  rows={3}
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="A short description of this category"
                />
              </FormField>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Appearance and display"
              description="Choose where the category appears and which image represents it."
            />
            <CardBody className="grid gap-5 md:grid-cols-2">
              <FormField
                label="Display order"
                htmlFor="display_order"
                hint="Lower numbers appear first on the homepage. Leave blank to clear it."
                error={fieldErrors.display_order}
              >
                <Input
                  id="display_order"
                  name="display_order"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={formData.display_order}
                  onChange={handleChange}
                  invalid={Boolean(fieldErrors.display_order)}
                  placeholder="0"
                  className="tabular-nums"
                />
              </FormField>

              <FormField
                label="Image URL"
                htmlFor="image_url"
                hint="Direct link to the category image."
                error={fieldErrors.image_url}
              >
                <Input
                  id="image_url"
                  name="image_url"
                  type="url"
                  value={formData.image_url}
                  onChange={handleChange}
                  invalid={Boolean(fieldErrors.image_url)}
                  placeholder="https://example.com/category-image.jpg"
                />
              </FormField>

              {previewUrl ? (
                <div className="flex items-center gap-4 rounded-md border border-gray-200 bg-gray-50 p-3 md:col-span-2">
                  {imageError ? (
                    <div
                      className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-300 bg-white text-gray-400"
                      aria-hidden="true"
                    >
                      <ImageOff className="h-5 w-5" />
                    </div>
                  ) : (
                    <img
                      src={previewUrl}
                      alt="Category image preview"
                      className="h-20 w-20 shrink-0 rounded-md border border-gray-200 bg-white object-cover"
                      // State-driven fallback; the old inline style.display hack
                      // kept the <img> hidden even after the URL was corrected.
                      onError={() => setImageError(true)}
                    />
                  )}
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-gray-900">Image preview</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {imageError
                        ? 'The image could not be loaded. Check that the URL is public and points directly to an image file.'
                        : 'This is how the category image will appear.'}
                    </p>
                  </div>
                </div>
              ) : null}
            </CardBody>

            <CardFooter className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/categories')}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" leftIcon={<Save />} loading={saving}>
                Save changes
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
};

export default EditCategoryPage;
