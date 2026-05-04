/* eslint-disable @next/next/no-img-element */
import { cn } from '@/lib/utils';

const normalizeThumbnailUrl = (thumbnail: string) => {
  if (!thumbnail) return null;

  try {
    const url = new URL(thumbnail);
    const id = url.searchParams.get('id');

    return id ? `${url.origin}${url.pathname}?id=${id}` : url.toString();
  } catch (error) {
    return thumbnail;
  }
};

const NewsThumbnail = ({
  className,
  imageClassName,
  thumbnail,
  title,
}: {
  className?: string;
  imageClassName?: string;
  thumbnail?: string;
  title: string;
}) => {
  const src = normalizeThumbnailUrl(thumbnail ?? '');

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-light-secondary dark:bg-dark-secondary',
        className,
      )}
    >
      {src ? (
        <img
          className={cn(
            'object-cover w-full h-full group-hover:scale-105 transition-transform duration-300',
            imageClassName,
          )}
          src={src}
          alt={title}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs font-medium text-black/50 dark:text-white/50">
          No image
        </div>
      )}
    </div>
  );
};

export default NewsThumbnail;
