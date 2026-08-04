const STAR_PATH =
  'M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z';

interface StarRatingProps {
  rating: number;
  reviewCount?: number;
  starSizeClass?: string;
}

/** Renders real stars for a real rating — callers should only mount this when
 * `rating > 0`, since there's no "0 rating" visual state worth showing. */
const StarRating = ({ rating, reviewCount, starSizeClass = 'h-3.5 w-3.5' }: StarRatingProps) => {
  const clamped = Math.max(0, Math.min(5, rating));
  const snapped = Math.round(clamped * 2) / 2;

  return (
    <div className="flex items-center">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            xmlns="http://www.w3.org/2000/svg"
            className={`${starSizeClass} ${snapped >= star - 0.5 ? 'text-yellow-400' : 'text-gray-300'}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d={STAR_PATH} />
          </svg>
        ))}
      </div>
      {typeof reviewCount === 'number' && reviewCount > 0 && (
        <span className="text-xs text-gray-500 ml-1">({reviewCount})</span>
      )}
    </div>
  );
};

export default StarRating;
