import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImageOff, Save } from 'lucide-react';
import { createCategory } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  FormField,
  Input,
  PageHeader,
  Textarea,
} from '../../components/ui';

/**
 * The form used to carry a "Color Theme" field (Tailwind class strings typed
 * by hand). The `categories` table has no `color` column in any migration and
 * nothing in the customer app or admin reads it, so any non-blank value made
 * PostgREST reject the INSERT (schema-cache error). Removed 2026-10-04.
 */
// Named CategoryFormValues rather than FormData so it does not shadow the DOM
// global `FormData` inside this module.
type CategoryFormValues = {
  name: string;
  description: string;
  image_url: string;
  display_order: string;
};

type FieldName = keyof CategoryFormValues;
type FieldErrors = Partial<Record<FieldName, string>>;

const NAME_MAX_LENGTH = 100;

/**
 * Image URLs are fetched by customers' browsers, so only http(s) counts as
 * valid. `new URL()` alone would also accept `ftp:`, `data:` or `foo:bar`.
 */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Turn a Supabase/PostgREST error into something an admin can act on. */
function describeCreateError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  if (code === '23505') {
    // categories_name_key UNIQUE (name)
    return 'A category with this name already exists.';
  }
  if (code === '42501') {
    // insufficient_privilege: RLS or grant denied the INSERT for this admin.
    return 'You do not have permission to create categories.';
  }
  return 'Could not create the category. Please try again.';
}

function validate(values: CategoryFormValues): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.name.trim()) {
    errors.name = 'Category name is required.';
  } else if (values.name.trim().length > NAME_MAX_LENGTH) {
    errors.name = `Category name must be ${NAME_MAX_LENGTH} characters or fewer.`;
  }

  if (values.display_order.trim()) {
    const n = Number(values.display_order);
    if (!Number.isInteger(n) || n < 0) {
      errors.display_order = 'Enter a whole number of 0 or more.';
    }
  }

  if (values.image_url.trim() && !isHttpUrl(values.image_url.trim())) {
    errors.image_url = 'Enter a complete image URL starting with http:// or https://.';
  }

  return errors;
}

const AddCategoryPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [previewError, setPreviewError] = useState(false);

  const [formData, setFormData] = useState<CategoryFormValues>({
    name: '',
    description: '',
    image_url: '',
    display_order: '',
  });

  // One change handler keyed on each control's `name`; every input below keeps
  // matching name / id / htmlFor so this stays correct.
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setFieldErrors(prev => (prev[name as FieldName] ? { ...prev, [name]: undefined } : prev));
    if (name === 'image_url') {
      // A new URL gets a fresh preview attempt; the old onError must not stick.
      setPreviewError(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    const errors = validate(formData);
    const firstInvalid = (Object.keys(errors) as FieldName[])[0];
    if (firstInvalid) {
      setFieldErrors(errors);
      // Field ids equal their names, so this lands on the first invalid control
      // (validate() adds keys in DOM order) and its role="alert" message.
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    try {
      setLoading(true);

      // Blank optional fields are sent as undefined so they are omitted from the
      // INSERT and the DB defaults apply (display_order DEFAULT 0).
      const categoryData = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        image_url: formData.image_url.trim() || undefined,
        display_order: formData.display_order.trim() ? Number(formData.display_order) : undefined,
      };

      const result = await createCategory(categoryData);

      if (result) {
        // Navigate straight away and confirm with a toast on the list page. The
        // old 1.5 s "Redirecting..." banner left the submit button re-enabled
        // (duplicate inserts) and its timer kept firing after unmount.
        showToast(`Category "${result.name}" created`, 'success');
        navigate('/categories');
      } else {
        setError('Could not create the category. Please try again.');
      }
    } catch (err) {
      // createCategory already logs the raw error; show a friendly message only.
      setError(describeCreateError(err));
    } finally {
      setLoading(false);
    }
  };

  const imageUrl = formData.image_url.trim();
  // Only a complete http(s) URL is worth a fetch: a half-typed address would
  // otherwise flash the "could not be loaded" state on every keystroke.
  const imageUrlLoadable = imageUrl !== '' && isHttpUrl(imageUrl);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Add category"
        description="Create a new product category for the catalogue."
        backTo="/categories"
        backLabel="Back to categories"
      />

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {error && (
          <Alert tone="danger" title="Category not created" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Card>
          <CardHeader
            title="Category information"
            description="The name is shown to customers; the description is only visible to admins."
          />
          <CardBody>
            <div className="grid gap-5 md:grid-cols-2">
              <FormField label="Category name" htmlFor="name" required error={fieldErrors.name} className="md:col-span-2">
                <Input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  maxLength={NAME_MAX_LENGTH}
                  invalid={Boolean(fieldErrors.name)}
                  placeholder="e.g. Vegetables, Fruits, Dairy"
                  autoComplete="off"
                />
              </FormField>

              <FormField
                label="Description"
                htmlFor="description"
                hint="Optional. A short note about what belongs in this category."
                className="md:col-span-2"
              >
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Enter a brief description of this category"
                />
              </FormField>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Appearance and display"
            description="Control where the category appears and the image customers see."
          />
          <CardBody>
            <div className="grid gap-5 md:grid-cols-2">
              <FormField
                label="Display order"
                htmlFor="display_order"
                hint="Optional. Lower numbers are listed first; blank uses the default (0)."
                error={fieldErrors.display_order}
              >
                <Input
                  type="number"
                  id="display_order"
                  name="display_order"
                  value={formData.display_order}
                  onChange={handleChange}
                  min={0}
                  step={1}
                  inputMode="numeric"
                  invalid={Boolean(fieldErrors.display_order)}
                  placeholder="e.g. 1, 2, 3"
                  className="tabular-nums"
                />
              </FormField>

              <FormField
                label="Image URL"
                htmlFor="image_url"
                hint="Optional. Direct https:// link to the category image."
                error={fieldErrors.image_url}
              >
                <Input
                  type="url"
                  id="image_url"
                  name="image_url"
                  value={formData.image_url}
                  onChange={handleChange}
                  invalid={Boolean(fieldErrors.image_url)}
                  placeholder="https://example.com/category-image.jpg"
                  autoComplete="off"
                />
              </FormField>

              {imageUrl && (
                <div className="md:col-span-2">
                  <p className="mb-2 text-sm font-medium text-gray-700">Image preview</p>
                  <div className="flex items-center gap-4 rounded-md border border-gray-200 bg-gray-50 p-3">
                    {!imageUrlLoadable || previewError ? (
                      <>
                        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400">
                          <ImageOff className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <p className="text-sm text-gray-500" role="status">
                          {!imageUrlLoadable
                            ? 'Enter a complete URL starting with http:// or https:// to see a preview.'
                            : 'The image could not be loaded. Check that the URL points directly to an image file.'}
                        </p>
                      </>
                    ) : (
                      <>
                        <img
                          // Keyed on the URL so a changed address always mounts a fresh <img>.
                          key={imageUrl}
                          src={imageUrl}
                          alt="Category preview"
                          className="h-24 w-24 shrink-0 rounded-md border border-gray-200 bg-white object-cover"
                          onError={() => setPreviewError(true)}
                          onLoad={() => setPreviewError(false)}
                        />
                        <p className="text-sm text-gray-500">This is how the category image will look to customers.</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardBody>
          <CardFooter className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/categories')}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" loading={loading} leftIcon={<Save />}>
              Create category
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};

export default AddCategoryPage;
