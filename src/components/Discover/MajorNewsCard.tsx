import { Discover } from '@/app/discover/page';
import Link from 'next/link';
import NewsThumbnail from './NewsThumbnail';

const MajorNewsCard = ({
  item,
  isLeft = true,
}: {
  item: Discover;
  isLeft?: boolean;
}) => (
  <Link
    href={`/?q=Summary: ${item.url}`}
    className="w-full group flex flex-row items-stretch gap-6 h-60 py-3"
    target="_blank"
  >
    {isLeft ? (
      <>
        <NewsThumbnail
          className="w-80 h-full rounded-2xl flex-shrink-0"
          imageClassName="duration-500"
          thumbnail={item.thumbnail}
          title={item.title}
        />
        <div className="flex flex-col justify-center flex-1 py-4">
          <h2
            className="text-3xl font-light mb-3 leading-tight line-clamp-3 group-hover:text-cyan-500 dark:group-hover:text-cyan-300 transition duration-200"
            style={{ fontFamily: 'PP Editorial, serif' }}
          >
            {item.title}
          </h2>
          <p className="text-black/60 dark:text-white/60 text-base leading-relaxed line-clamp-4">
            {item.content}
          </p>
        </div>
      </>
    ) : (
      <>
        <div className="flex flex-col justify-center flex-1 py-4">
          <h2
            className="text-3xl font-light mb-3 leading-tight line-clamp-3 group-hover:text-cyan-500 dark:group-hover:text-cyan-300 transition duration-200"
            style={{ fontFamily: 'PP Editorial, serif' }}
          >
            {item.title}
          </h2>
          <p className="text-black/60 dark:text-white/60 text-base leading-relaxed line-clamp-4">
            {item.content}
          </p>
        </div>
        <NewsThumbnail
          className="w-80 h-full rounded-2xl flex-shrink-0"
          imageClassName="duration-500"
          thumbnail={item.thumbnail}
          title={item.title}
        />
      </>
    )}
  </Link>
);

export default MajorNewsCard;
