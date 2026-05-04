/* eslint-disable @next/next/no-img-element */
import { ImagesIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

type Image = {
  url: string;
  img_src: string;
  title: string;
};

const SearchImages = ({
  query,
  chatHistory,
  messageId,
}: {
  query: string;
  chatHistory: [string, string][];
  messageId: string;
}) => {
  const [images, setImages] = useState<Image[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [slides, setSlides] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {!loading && images === null && (
        <button
          id={`search-images-${messageId}`}
          onClick={async () => {
            setLoading(true);
            setError(null);

            try {
              const chatModelProvider = localStorage.getItem(
                'chatModelProviderId',
              );
              const chatModel = localStorage.getItem('chatModelKey');

              if (!chatModel || !chatModelProvider) {
                setImages([]);
                setError('Select a chat model before searching images.');
                return;
              }

              const res = await fetch(`/api/images`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  query: query,
                  chatHistory: chatHistory,
                  chatModel: {
                    providerId: chatModelProvider,
                    key: chatModel,
                  },
                }),
              });

              const data = await res.json().catch(() => ({}));

              if (!res.ok) {
                throw new Error(
                  data.message ||
                    `Image search failed with status ${res.status}`,
                );
              }

              const images = data.images ?? [];
              setImages(images);
              setError(data.warning ?? null);
              setSlides(
                images.map((image: Image) => {
                  return {
                    src: image.img_src,
                  };
                }),
              );
            } catch (err: any) {
              setImages([]);
              setError(err.message || 'Image search failed.');
            } finally {
              setLoading(false);
            }
          }}
          onMouseDown={(event) => event.currentTarget.blur()}
          className="border border-dashed border-light-200 dark:border-dark-200 hover:bg-light-200 dark:hover:bg-dark-200 active:scale-95 duration-200 transition px-4 py-2 flex flex-row items-center justify-between rounded-lg dark:text-white text-sm w-full"
        >
          <div className="flex flex-row items-center space-x-2">
            <ImagesIcon size={17} />
            <p>Search images</p>
          </div>
          <PlusIcon className="text-[#24A0ED]" size={17} />
        </button>
      )}
      {loading && (
        <div className="grid grid-cols-2 gap-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-light-secondary dark:bg-dark-secondary h-32 w-full rounded-lg animate-pulse aspect-video object-cover"
            />
          ))}
        </div>
      )}
      {images !== null && images.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {images.length > 4
              ? images.slice(0, 3).map((image, i) => (
                  <img
                    onClick={() => {
                      setOpen(true);
                      setSlides([
                        slides[i],
                        ...slides.slice(0, i),
                        ...slides.slice(i + 1),
                      ]);
                    }}
                    key={i}
                    src={image.img_src}
                    alt={image.title}
                    className="h-full w-full aspect-video object-cover rounded-lg transition duration-200 active:scale-95 hover:scale-[1.02] cursor-zoom-in"
                  />
                ))
              : images.map((image, i) => (
                  <img
                    onClick={() => {
                      setOpen(true);
                      setSlides([
                        slides[i],
                        ...slides.slice(0, i),
                        ...slides.slice(i + 1),
                      ]);
                    }}
                    key={i}
                    src={image.img_src}
                    alt={image.title}
                    className="h-full w-full aspect-video object-cover rounded-lg transition duration-200 active:scale-95 hover:scale-[1.02] cursor-zoom-in"
                  />
                ))}
            {images.length > 4 && (
              <button
                onClick={() => setOpen(true)}
                className="bg-light-100 hover:bg-light-200 dark:bg-dark-100 dark:hover:bg-dark-200 transition duration-200 active:scale-95 hover:scale-[1.02] h-auto w-full rounded-lg flex flex-col justify-between text-white p-2"
              >
                <div className="flex flex-row items-center space-x-1">
                  {images.slice(3, 6).map((image, i) => (
                    <img
                      key={i}
                      src={image.img_src}
                      alt={image.title}
                      className="h-6 w-12 rounded-md lg:h-3 lg:w-6 lg:rounded-sm aspect-video object-cover"
                    />
                  ))}
                </div>
                <p className="text-black/70 dark:text-white/70 text-xs">
                  View {images.length - 3} more
                </p>
              </button>
            )}
          </div>
          <Lightbox open={open} close={() => setOpen(false)} slides={slides} />
        </>
      )}
      {images !== null && images.length === 0 && (
        <div className="border border-dashed border-light-200 dark:border-dark-200 rounded-lg px-4 py-3 text-sm text-black/60 dark:text-white/60">
          {error ?? 'No images found.'}
        </div>
      )}
    </>
  );
};

export default SearchImages;
