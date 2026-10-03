import { useEffect, useRef, useState } from 'react';
import { mockupUrl, proposalMockupUrl } from '../api/client';
import type { Tone } from '../diagram/DiagramView';

export type FramePin = { id: string; selector: string; n: number; tone: Tone };

type Props = {
  repo: string;
  project: string;
  itemId: string;
  side: 'after' | 'before';
  device: 'desktop' | 'mobile';
  pins?: FramePin[];
  pinMode?: boolean;
  onPicked?: (pick: { selector: string; text: string }) => void;
  onOpenPin?: (id: string) => void;
  onMissingPins?: (ids: string[]) => void;
  /** Small, not interactive, and loaded only when scrolled into view. */
  thumbnail?: boolean;
  /** Show what this open option proposes instead of the saved markup. Pins and pin mode are ignored. */
  proposal?: { threadId: string; optionId: string };
};

type FrameMessage =
  | { type: 'size'; height: number }
  | { type: 'leaving' }
  | { type: 'picked'; selector: string; text: string }
  | { type: 'open-pin'; id: string }
  | { type: 'missing-pins'; ids: unknown[] };

/** Desktop renders 1280 px wide and mobile 390 px, both scaled down to fit. Thumbnails render as mobile. */
const WIDTHS = { desktop: 1280, mobile: 390 } as const;
/** The box's height until the frame says how tall its content is (240 px, before scaling). */
const MIN_HEIGHT = 240;
/**
 * The frame's own height is a device screen and never follows the content, so a mockup's vh units mean one screen
 * (min-h-screen is one screen, not a loop). Pages taller than that scroll inside the frame, as on a device.
 */
const DEVICE_HEIGHTS = { desktop: 800, mobile: 844 } as const;
/** A frame that navigates itself is put back this many times per document before it's blanked. */
const MAX_RESETS = 2;
/** What a picked element's label and selector are cut to before the app sees them. */
const MAX_LABEL = 60;
const MAX_SELECTOR = 500;

/**
 * One side of a UI item's mockup. The frame is sandboxed with scripts but without same-origin, so its document has an
 * opaque origin: it can't read the app's cookies or call the API. It talks to the app only with postMessage, and only
 * messages from this frame's own window count. The service's PIN_SCRIPT is the other side.
 */
export function MockupFrame(p: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef(p);
  latest.current = p;
  const [boxWidth, setBoxWidth] = useState(0);
  const [height, setHeight] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  /** How many times the current document has loaded. More than one means the frame navigated itself. */
  const loads = useRef(0);
  /** True from a self-navigation until the reset document loads: nothing the frame says counts meanwhile. */
  const navigated = useRef(false);
  /** The ids the frame was last given pins for. It may open only these. */
  /** How many times this document has been put back after navigating. */
  const resets = useRef(0);
  const [broken, setBroken] = useState(false);
  const sentPins = useRef<Set<string>>(new Set());
  const [visible, setVisible] = useState(!p.thumbnail || typeof IntersectionObserver === 'undefined');
  const width = p.thumbnail ? WIDTHS.mobile : WIDTHS[p.device];
  const deviceHeight = p.thumbnail ? DEVICE_HEIGHTS.mobile : DEVICE_HEIGHTS[p.device];
  const scale = boxWidth > 0 ? Math.min(1, boxWidth / width) : 1;
  const src = p.proposal
    ? proposalMockupUrl(p.repo, p.project, p.proposal.threadId, p.proposal.optionId, p.side)
    : mockupUrl(p.repo, p.project, p.itemId, p.side);
  // Only a saved mockup shown full size takes pins.
  const pinnable = !p.thumbnail && !p.proposal;

  const srcRef = useRef(src);
  srcRef.current = src;

  // A new document starts unmeasured, and isn't ready for messages until it loads.
  useEffect(() => {
    setHeight(null);
    setLoaded(false);
    loads.current = 0;
    navigated.current = false;
    sentPins.current = new Set();
    resets.current = 0;
    setBroken(false);
  }, [src, visible]);

  // A sandbox and a CSP can't stop a frame navigating itself. The document says when it's leaving, and any load after
  // the first means it went somewhere. Either way: put it back, ignore it until the reset document has loaded, and
  // blank a frame that keeps doing it.
  const navigatedAway = () => {
    navigated.current = true;
    loads.current = 0;
    sentPins.current = new Set();
    setLoaded(false);
    resets.current += 1;
    if (resets.current > MAX_RESETS) {
      setBroken(true);
      return;
    }
    if (frame.current) frame.current.src = srcRef.current;
  };
  const onFrameLoad = () => {
    if (!visible) return;
    loads.current += 1;
    if (loads.current === 1) {
      navigated.current = false;
      setLoaded(true);
      return;
    }
    navigatedAway();
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setBoxWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = box.current;
    if (visible || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (navigated.current || e.source !== frame.current?.contentWindow || e.data?.source !== 'dp-mockup') return;
      const m = e.data as FrameMessage;
      const now = latest.current;
      if (m.type === 'size') {
        if (typeof m.height !== 'number' || !Number.isFinite(m.height) || m.height < 0) return;
        setHeight(Math.max(1, Math.ceil(m.height)));
        return;
      }
      // Before the first load, a "leaving" is the previous document going away because we changed the src.
      if (m.type === 'leaving') {
        if (loads.current > 0) navigatedAway();
        return;
      }
      if (now.thumbnail || now.proposal) return;
      // A pick only counts in pin mode, and an open-pin only for a pin this frame was given.
      if (m.type === 'picked' && now.pinMode && typeof m.selector === 'string') now.onPicked?.({ selector: m.selector.slice(0, MAX_SELECTOR), text: String(m.text ?? '').slice(0, MAX_LABEL) });
      else if (m.type === 'open-pin' && typeof m.id === 'string' && sentPins.current.has(m.id)) now.onOpenPin?.(m.id);
      else if (m.type === 'missing-pins' && Array.isArray(m.ids)) now.onMissingPins?.(m.ids.filter((id): id is string => typeof id === 'string' && sentPins.current.has(id)));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Pins and pin mode go to the frame once it has loaded, and again whenever they change.
  const pinsKey = JSON.stringify(p.pins ?? []);
  useEffect(() => {
    const win = frame.current?.contentWindow;
    if (!loaded || !win || !pinnable) return;
    const pins = latest.current.pins ?? [];
    sentPins.current = new Set(pins.map((pin) => pin.id));
    win.postMessage({ source: 'dp-app', type: 'pins', pins }, '*');
    win.postMessage({ source: 'dp-app', type: 'pin-mode', on: Boolean(p.pinMode) }, '*');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, pinsKey, p.pinMode, pinnable]);

  if (broken) {
    return (
      <div ref={box} className="w-full min-w-0 py-6 text-center text-[13px] text-ink-3">
        This mockup couldn't be shown.
      </div>
    );
  }

  const shown = height === null ? MIN_HEIGHT : Math.min(height, deviceHeight);
  return (
    <div ref={box} className="w-full min-w-0">
      <div
        className="relative mx-auto overflow-hidden rounded-[10px] border-[0.5px] border-separator"
        style={{ width: Math.round(width * scale), maxWidth: '100%', height: Math.round(shown * scale), pointerEvents: p.thumbnail ? 'none' : undefined }}
      >
        <iframe
          ref={frame}
          data-testid="mockup-frame"
          title={`${p.side === 'after' ? 'After' : 'Before'} mockup`}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          loading={p.thumbnail ? 'lazy' : undefined}
          tabIndex={p.thumbnail ? -1 : undefined}
          src={visible ? src : undefined}
          width={width}
          height={deviceHeight}
          onLoad={onFrameLoad}
          className="absolute left-0 top-0 block border-0 bg-white"
          style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}
        />
      </div>
    </div>
  );
}
