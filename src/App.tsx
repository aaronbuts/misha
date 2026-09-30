import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import worksManifest from "./works-manifest.json";

type WorkMedia = { id: string; src: string; width: number; height: number; type: "image" | "gif" };
type WorkCategory = { id: string; title: string; description?: string; items: WorkMedia[] };
type PreviewItem = WorkMedia & { categoryId: string; categoryTitle: string; itemIndex: number };
type FlightGeometry = { src: string; left: number; top: number; width: number; height: number; targetLeft: number; targetTop: number; targetWidth: number; targetHeight: number };

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
const workCategories = (worksManifest as WorkCategory[]).map((category) => ({
  ...category,
  items: category.items.map((item) => ({ ...item, src: assetPath(item.src) })),
}));
const stableHash = (value: string) => [...value].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) | 0, 17);
const typesetDescription = (value: string) => value.replace(
  /(^|[^\S\r\n])(в|во|на|с|со|к|ко|о|об|обо|от|до|по|за|из|изо|у|и|а|но|для|при|над|под|про|без|через|между)[ \t]+(?=\S)/gimu,
  "$1$2\u00a0",
);
const renderDescription = (value: string) => {
  const typeset = typesetDescription(value);
  const forcedBreaks = ["В\u00a0целом", "две вариации"];
  const breakIndex = forcedBreaks
    .map((phrase) => typeset.indexOf(phrase))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? -1;
  if (breakIndex < 0) return typeset;
  return <>{typeset.slice(0, breakIndex).trimEnd()}<br />{typeset.slice(breakIndex)}</>;
};
const cardClassName = (item: PreviewItem) => {
  return `workCard masonryCard${item.type === "gif" ? " isMotion" : ""}`;
};
const columnCount = 20;
const previewItems: PreviewItem[] = workCategories
  .flatMap((category) => category.items.map((item, itemIndex) => ({
    ...item,
    categoryId: category.id,
    categoryTitle: category.title,
    itemIndex,
  })));

const createMasonryColumns = (initialSeed: number) => {
  const shuffledItems = [...previewItems];
  let shuffleSeed = initialSeed >>> 0;
  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    shuffleSeed = (Math.imul(shuffleSeed, 1664525) + 1013904223) >>> 0;
    const swapIndex = shuffleSeed % (index + 1);
    [shuffledItems[index], shuffledItems[swapIndex]] = [shuffledItems[swapIndex], shuffledItems[index]];
  }

  const cardsPerColumn = Math.ceil(shuffledItems.length / columnCount);
  const columns: PreviewItem[][] = Array.from({ length: columnCount }, () => []);
  const weights = Array.from({ length: columns.length }, () => 0);
  shuffledItems.forEach((item) => {
    const columnScores = columns.map((column, columnIndex) => {
      if (column.length >= cardsPerColumn) return Number.POSITIVE_INFINITY;
      const rowIndex = column.length;
      const neighbours = [columns[columnIndex - 1], columns[columnIndex + 1]].filter(Boolean);
      const sameColumn = column.some((placed) => placed.categoryId === item.categoryId);
      const sameNeighbour = neighbours.some((neighbour) => neighbour.some((placed) => placed.categoryId === item.categoryId));
      const sameHorizontalRow = neighbours.some((neighbour) => neighbour[rowIndex]?.categoryId === item.categoryId);
      const jitter = ((stableHash(`${initialSeed}-${item.id}-${columnIndex}`) >>> 0) % 1000) / 100000;

      return weights[columnIndex] * 25
        + (sameColumn ? 8 : 0)
        + (sameNeighbour ? 4 : 0)
        + (sameHorizontalRow ? 12 : 0)
        + jitter;
    });
    const targetColumn = columnScores.indexOf(Math.min(...columnScores));
    columns[targetColumn].push(item);
    weights[targetColumn] += item.height / item.width + 0.03;
  });
  return columns;
};

const initialMasonryColumns = createMasonryColumns(0x61c88647);

export default function Home() {
  const [masonryColumns, setMasonryColumns] = useState(initialMasonryColumns);
  const [active, setActive] = useState<{ categoryId: string; startIndex: number; flight: FlightGeometry } | null>(null);
  const [closing, setClosing] = useState(false);
  const [blinking, setBlinking] = useState(false);
  const [heroReady, setHeroReady] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const [flightVisible, setFlightVisible] = useState(false);
  const [flightReady, setFlightReady] = useState(false);
  const [flightFading, setFlightFading] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const hoverPauseTimerRef = useRef<number | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragOffsetRef = useRef(0);
  const firstMediaRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef({ pointerId: -1, startX: 0, startOffset: 0, moved: false, suppressClick: false });
  const activeCategory = active ? workCategories.find((category) => category.id === active.categoryId) ?? null : null;
  const activeItems = activeCategory && active
    ? [...activeCategory.items.slice(active.startIndex), ...activeCategory.items.slice(0, active.startIndex)]
    : [];

  useLayoutEffect(() => {
    const seed = globalThis.crypto?.getRandomValues(new Uint32Array(1))[0] ?? Date.now();
    setMasonryColumns(createMasonryColumns(seed));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const mobile = window.matchMedia("(max-width: 900px)").matches;
    const heroAssets = mobile
      ? ["hero-roles-mobile.svg", "hero-signature-mobile.svg", "hero-zholudev-mobile.webp", "hero-misha-mobile.webp", "hero-person.webp"]
      : ["hero-roles-desktop.svg", "hero-signature-desktop.svg", "hero-zholudev-desktop.webp", "hero-misha-desktop.webp", "hero-person-desktop.webp"];

    const loadAsset = async (src: string) => {
      const image = new Image();
      image.src = assetPath(src);
      try {
        await image.decode();
      } catch {
        await new Promise<void>((resolve) => {
          if (image.complete) return resolve();
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }
    };

    void Promise.all(heroAssets.map(loadAsset)).then(() => {
      if (!cancelled) window.requestAnimationFrame(() => setHeroReady(true));
    });
    return () => { cancelled = true; };
  }, []);

  const closeProject = () => {
    setClosing(true);
    window.setTimeout(() => {
      setActive(null);
      setClosing(false);
      setHeaderHidden(false);
      setFlightVisible(false);
      setFlightReady(false);
      setFlightFading(false);
    }, 360);
  };

  const openProject = (work: PreviewItem, event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const allowFlight = !window.matchMedia("(max-width: 900px), (max-width: 1000px) and (max-aspect-ratio: 4/5)").matches;
    setHeaderHidden(false);
    setFlightVisible(allowFlight);
    setFlightReady(false);
    setFlightFading(false);
    setActive({
      categoryId: work.categoryId,
      startIndex: work.itemIndex,
      flight: {
        src: work.src,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        targetLeft: rect.left,
        targetTop: rect.top,
        targetWidth: rect.width,
        targetHeight: rect.height,
      },
    });
  };

  useLayoutEffect(() => {
    if (!active || !flightVisible || !firstMediaRef.current) return;
    const media = firstMediaRef.current;
    let cancelled = false;
    let measureFrame = 0;
    let startFrame = 0;
    let revealTimer = 0;
    let finishTimer = 0;

    const startFlight = async () => {
      try {
        await media.decode();
      } catch {
        // The loaded event is still enough to continue if decode is unsupported.
      }
      if (cancelled) return;

      measureFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        const target = media.getBoundingClientRect();
        setActive((current) => current ? {
          ...current,
          flight: {
            ...current.flight,
            targetLeft: target.left,
            targetTop: target.top,
            targetWidth: target.width,
            targetHeight: target.height,
          },
        } : current);

        startFrame = window.requestAnimationFrame(() => {
          if (!cancelled) setFlightReady(true);
        });
        revealTimer = window.setTimeout(() => {
          if (cancelled) return;
          setFlightFading(true);
          finishTimer = window.setTimeout(() => {
            if (cancelled) return;
            setFlightVisible(false);
            setFlightFading(false);
          }, 420);
        }, 650);
      });
    };

    void startFlight();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(measureFrame);
      window.cancelAnimationFrame(startFrame);
      window.clearTimeout(revealTimer);
      window.clearTimeout(finishTimer);
    };
  }, [active?.categoryId, active?.startIndex, flightVisible]);

  const startCarouselDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = carouselRef.current;
    if (!viewport) return;
    viewport.classList.add("hintDismissed");
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startOffset: Number(viewport.dataset.dragOffset ?? 0),
      moved: false,
      suppressClick: false,
    };
  };

  const moveCarousel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = carouselRef.current;
    if (!viewport || dragRef.current.pointerId !== event.pointerId) return;
    const delta = event.clientX - dragRef.current.startX;
    const dragThreshold = event.pointerType === "mouse" ? 18 : 9;
    if (!dragRef.current.moved && Math.abs(delta) < dragThreshold) return;
    if (!dragRef.current.moved) {
      dragRef.current.moved = true;
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add("isDragging");
    }
    const nextOffset = dragRef.current.startOffset + delta;
    pendingDragOffsetRef.current = nextOffset;
    if (dragFrameRef.current === null) {
      dragFrameRef.current = window.requestAnimationFrame(() => {
        const currentViewport = carouselRef.current;
        if (currentViewport) {
          currentViewport.dataset.dragOffset = String(pendingDragOffsetRef.current);
          currentViewport.style.setProperty("--drag-offset", `${pendingDragOffsetRef.current}px`);
        }
        dragFrameRef.current = null;
      });
    }
  };

  const endCarouselDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = carouselRef.current;
    if (!viewport || dragRef.current.pointerId !== event.pointerId) return;
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
      viewport.dataset.dragOffset = String(pendingDragOffsetRef.current);
      viewport.style.setProperty("--drag-offset", `${pendingDragOffsetRef.current}px`);
    }
    viewport.classList.remove("isDragging");
    dragRef.current.pointerId = -1;
    if (dragRef.current.moved) {
      dragRef.current.suppressClick = true;
      window.setTimeout(() => { dragRef.current.suppressClick = false; }, 0);
    }
  };

  useEffect(() => {
    if (!active) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && closeProject();
    window.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", close);
      document.body.style.overflow = "";
    };
  }, [active]);

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("isVisible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!heroReady) return;
    const desktopBlink = new Image();
    desktopBlink.src = assetPath("hero-person-blink-desktop.webp");
    const mobileBlink = new Image();
    mobileBlink.src = assetPath("hero-person-blink.webp");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const later = (callback: () => void, delay: number) => {
      const timer = setTimeout(callback, delay);
      timers.push(timer);
    };
    const blinkOnce = (done: () => void) => {
      if (cancelled) return;
      setBlinking(true);
      later(() => {
        setBlinking(false);
        done();
      }, 105 + Math.random() * 55);
    };
    const scheduleBlink = (first = false) => {
      const pause = first
        ? 500 + Math.random() * 1000
        : 2500 + Math.random() * 4000;
      later(() => {
        const doubleBlink = first || Math.random() < 0.3;
        blinkOnce(() => {
          if (!doubleBlink) {
            scheduleBlink();
            return;
          }
          later(() => blinkOnce(scheduleBlink), 120 + Math.random() * 140);
        });
      }, pause);
    };

    scheduleBlink(true);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [heroReady]);

  return (
    <main>
      <section className={`hero${heroReady ? " isReady" : ""}`} id="top" aria-busy={!heroReady}>
        <picture className="heroRoles">
          <source media="(max-width: 900px)" srcSet={assetPath("hero-roles-mobile.svg")} />
          <img src={assetPath("hero-roles-desktop.svg")} alt="Графический, маркетинг, UI/UX дизайнер" />
        </picture>
        <picture className="heroSignature">
          <source media="(max-width: 900px)" srcSet={assetPath("hero-signature-mobile.svg")} />
          <img src={assetPath("hero-signature-desktop.svg")} alt="Жолудев Миша" />
        </picture>
        <picture className="heroSurname">
          <source media="(max-width: 900px)" srcSet={assetPath("hero-zholudev-mobile.webp")} />
          <img src={assetPath("hero-zholudev-desktop.webp")} alt="Жолудев" fetchPriority="high" />
        </picture>
        <picture className="heroFirstname">
          <source media="(max-width: 900px)" srcSet={assetPath("hero-misha-mobile.webp")} />
          <img src={assetPath("hero-misha-desktop.webp")} alt="Миша" fetchPriority="high" />
        </picture>
        <picture className="heroPerson">
          <source media="(max-width: 900px)" srcSet={assetPath(blinking ? "hero-person-blink.webp" : "hero-person.webp")} />
          <img src={assetPath(blinking ? "hero-person-blink-desktop.webp" : "hero-person-desktop.webp")} alt="Миша Жолудев" fetchPriority="high" />
        </picture>
      </section>

      <section className="work" id="work">
        <h2 className="revealTitle" data-reveal>РАБОТЫ</h2>
        <div
          ref={carouselRef}
          className="masonryViewport revealMasonry"
          data-reveal
          aria-label="Галерея проектов"
          onPointerDown={startCarouselDrag}
          onPointerMove={moveCarousel}
          onPointerUp={endCarouselDrag}
          onPointerCancel={endCarouselDrag}
          onClickCapture={(event) => {
            if (!dragRef.current.suppressClick) return;
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div className="masonryTrack">
            {[0, 1].map((setIndex) => (
              <div className="masonrySet" aria-hidden={setIndex === 1} key={setIndex}>
                {masonryColumns.map((column, columnIndex) => (
                  <div
                    className="masonryColumn"
                    key={`${setIndex}-${columnIndex}`}
                    style={{ "--column-ratio-sum": column.reduce((sum, item) => sum + item.height / item.width, 0) } as CSSProperties}
                  >
                    {column.map((work, tileIndex) => (
                      <button
                        className={cardClassName(work)}
                        key={`${setIndex}-${columnIndex}-${work.id}-${tileIndex}`}
                        onPointerEnter={(event) => {
                          if (event.pointerType !== "mouse") return;
                          const viewport = carouselRef.current;
                          if (!viewport) return;
                          const hintWasVisible = !viewport.classList.contains("hintDismissed");
                          viewport.classList.add("hintDismissed");
                          if (hoverPauseTimerRef.current !== null) window.clearTimeout(hoverPauseTimerRef.current);
                          hoverPauseTimerRef.current = window.setTimeout(() => {
                            viewport.classList.add("cardHovered");
                            hoverPauseTimerRef.current = null;
                          }, hintWasVisible ? 420 : 0);
                        }}
                        onPointerLeave={(event) => {
                          if (event.pointerType !== "mouse") return;
                          const viewport = carouselRef.current;
                          if (hoverPauseTimerRef.current !== null) {
                            window.clearTimeout(hoverPauseTimerRef.current);
                            hoverPauseTimerRef.current = null;
                          }
                          viewport?.classList.remove("cardHovered");
                        }}
                        onClick={(event) => openProject(work, event)}
                        aria-label={`Открыть проект ${work.categoryTitle}, начиная с выбранного кадра`}
                      >
                        <img
                          src={work.src}
                          alt=""
                          width={work.width}
                          height={work.height}
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                        />
                        <span className="cardInfo">{work.categoryTitle}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="contactSection">
        <a className="revealContact" data-reveal href="https://t.me/www_gip" target="_blank" rel="noreferrer">
          <span>НАПИСАТЬ В</span>
          <strong><b>TELEGRAM</b><i aria-hidden="true">↗</i></strong>
        </a>
      </section>

      {active && activeCategory && (
        <div
          className={`overlay ${closing ? "isClosing" : ""} hasFlight`}
          role="dialog"
          aria-modal="true"
          aria-label={activeCategory.title}
          onMouseDown={(event) => event.target === event.currentTarget && closeProject()}
        >
          <div className="projectSheet" onScroll={(event) => setHeaderHidden(event.currentTarget.scrollTop > 12)}>
            <button className="overlayClose" onClick={closeProject} aria-label="Закрыть проект">×</button>
            <div className={`overlayTop ${headerHidden ? "isHidden" : ""}`}>
              <div className="overlayHeading">
                <h3 className={activeCategory.title.length > 27 ? "veryLongTitle" : activeCategory.title.length > 15 ? "longTitle" : undefined}>
                  {activeCategory.title === "Презентация Лабы для вузов"
                    ? <>Презентация Лабы<br />для ВУЗов</>
                    : activeCategory.title}
                </h3>
                {activeCategory.description && (
                  <p className={activeCategory.title === "Презентация Лабы для вузов" ? "compactDescription" : undefined}>
                    {renderDescription(activeCategory.description)}
                  </p>
                )}
              </div>
            </div>
            <div className="caseGrid">
              {activeItems.map((item, index) => (
                <img
                  key={item.id}
                  ref={index === 0 ? firstMediaRef : undefined}
                  className={`${item.type === "gif" && item.height > item.width ? "verticalMotion " : ""}${index === 0 && flightVisible && !flightFading ? "isReceivingFlight" : ""}`.trim() || undefined}
                  src={item.src}
                  alt={`${activeCategory.title}, кадр ${index + 1}`}
                  width={item.width}
                  height={item.height}
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                />
              ))}
            </div>
          </div>
        </div>
      )}
      {active && flightVisible && (
        <img
          className={`cardFlight ${flightReady ? "isReady" : ""} ${flightFading ? "isFading" : ""}`}
          src={active.flight.src}
          alt=""
          style={{
            "--flight-left": `${active.flight.left}px`,
            "--flight-top": `${active.flight.top}px`,
            "--flight-width": `${active.flight.width}px`,
            "--flight-height": `${active.flight.height}px`,
            "--flight-target-left": `${active.flight.targetLeft}px`,
            "--flight-target-top": `${active.flight.targetTop}px`,
            "--flight-target-width": `${active.flight.targetWidth}px`,
            "--flight-target-height": `${active.flight.targetHeight}px`,
          } as CSSProperties}
        />
      )}
    </main>
  );
}
