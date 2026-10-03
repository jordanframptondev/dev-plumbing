import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockupFrame, type FramePin } from './MockupFrame';

afterEach(cleanup);

const PIN: FramePin = { id: 'ui-about-restock-soon', selector: 'body > main:nth-of-type(1) > div:nth-of-type(1)', n: 1, tone: 'slate' };
const base = { repo: 'acme-app', project: 'restock', itemId: 'ui-settings', side: 'after' as const, device: 'desktop' as const };
const frameEl = () => screen.getByTestId('mockup-frame') as HTMLIFrameElement;
/** A message as if `source` posted it: the frame's own window unless given. */
const message = (data: unknown, source: MessageEventSource | null = frameEl().contentWindow) =>
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, source }));
  });

describe('MockupFrame', () => {
  it('is sandboxed without same-origin, and as wide as the device', () => {
    const { rerender } = render(<MockupFrame {...base} />);
    expect(frameEl().getAttribute('sandbox')).toBe('allow-scripts');
    expect(frameEl().getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frameEl().getAttribute('src')).toBe('/api/projects/acme-app/restock/items/ui-settings/mockup/after');
    expect(frameEl().getAttribute('title')).toBe('After mockup');
    expect(frameEl().getAttribute('width')).toBe('1280');
    rerender(<MockupFrame {...base} side="before" device="mobile" />);
    expect(frameEl().getAttribute('width')).toBe('390');
    expect(frameEl().getAttribute('src')).toBe('/api/projects/acme-app/restock/items/ui-settings/mockup/before');
  });

  it('takes its height from the frame', () => {
    render(<MockupFrame {...base} />);
    const box = frameEl().parentElement!;
    expect(box.style.height).toBe('240px');
    message({ source: 'dp-mockup', type: 'size', height: 500 });
    expect(box.style.height).toBe('500px');
    // The frame's own viewport is the device's, so vh in a mockup means one screen and never follows the content.
    expect(frameEl().getAttribute('height')).toBe('800');
    message({ source: 'dp-mockup', type: 'size', height: 5000 });
    expect(box.style.height).toBe('800px');
    expect(frameEl().getAttribute('height')).toBe('800');
  });

  it('listens only to its own frame, and only for what it asked for', () => {
    const onPicked = vi.fn();
    const onOpenPin = vi.fn();
    const onMissingPins = vi.fn();
    const props = { ...base, pins: [PIN], onPicked, onOpenPin, onMissingPins };
    const { rerender } = render(<MockupFrame {...props} />);
    const pick = { source: 'dp-mockup', type: 'picked', selector: PIN.selector, text: 'Restock soon' };
    message(pick); // not in pin mode
    rerender(<MockupFrame {...props} pinMode />);
    frameEl().contentWindow!.postMessage = () => {};
    fireEvent.load(frameEl()); // pins reach the frame
    message(pick, window); // from another window
    message({ ...pick, source: 'someone-else' });
    expect(onPicked).not.toHaveBeenCalled();
    message(pick);
    expect(onPicked).toHaveBeenCalledWith({ selector: PIN.selector, text: 'Restock soon' });
    message({ source: 'dp-mockup', type: 'open-pin', id: 'x' });
    expect(onOpenPin).not.toHaveBeenCalled();
    message({ source: 'dp-mockup', type: 'open-pin', id: PIN.id });
    expect(onOpenPin).toHaveBeenCalledWith(PIN.id);
    message({ source: 'dp-mockup', type: 'missing-pins', ids: [PIN.id] });
    expect(onMissingPins).toHaveBeenCalledWith([PIN.id]);
  });

  it('sends pins and pin mode once the frame has loaded, and again when they change', () => {
    const props = { ...base, pins: [PIN] };
    const { rerender } = render(<MockupFrame {...props} />);
    const posted: unknown[] = [];
    frameEl().contentWindow!.postMessage = (m: unknown) => {
      posted.push(m);
    };
    expect(posted).toEqual([]);
    fireEvent.load(frameEl());
    expect(posted).toContainEqual({ source: 'dp-app', type: 'pins', pins: [PIN] });
    expect(posted).toContainEqual({ source: 'dp-app', type: 'pin-mode', on: false });
    rerender(<MockupFrame {...props} pinMode />);
    expect(posted).toContainEqual({ source: 'dp-app', type: 'pin-mode', on: true });
  });

  it("shows an option's proposed mockup, without pins", () => {
    const onPicked = vi.fn();
    render(<MockupFrame {...base} proposal={{ threadId: 't-ui-settings', optionId: 'days' }} pins={[PIN]} pinMode onPicked={onPicked} />);
    expect(frameEl().getAttribute('src')).toBe('/api/projects/acme-app/restock/threads/t-ui-settings/options/days/mockup/after');
    const posted: unknown[] = [];
    frameEl().contentWindow!.postMessage = (m: unknown) => {
      posted.push(m);
    };
    fireEvent.load(frameEl());
    expect(posted).toEqual([]);
    message({ source: 'dp-mockup', type: 'picked', selector: PIN.selector, text: 'Restock soon' });
    expect(onPicked).not.toHaveBeenCalled();
  });

  describe('against a frame that misbehaves', () => {
    const setup = (extra: Record<string, unknown> = {}) => {
      const rendered = render(<MockupFrame {...base} pins={[PIN]} {...extra} />);
      frameEl().contentWindow!.postMessage = () => {};
      return rendered;
    };

    it('puts the frame back when it navigates itself, and ignores it meanwhile', () => {
      const onPicked = vi.fn();
      setup({ pinMode: true, onPicked });
      const setSrc = vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set');
      const first = frameEl();
      fireEvent.load(first);
      expect(frameEl()).toBe(first);
      fireEvent.load(first); // a second load: the frame went somewhere
      // Put back as a new element, never by reassigning src, which would add a history entry that Back then walks.
      expect(frameEl()).not.toBe(first);
      expect(frameEl().getAttribute('src')).toBe('/api/projects/acme-app/restock/items/ui-settings/mockup/after');
      expect(setSrc).not.toHaveBeenCalled();
      const reset = frameEl();
      reset.contentWindow!.postMessage = () => {};
      message({ source: 'dp-mockup', type: 'picked', selector: PIN.selector, text: 'x' });
      expect(onPicked).not.toHaveBeenCalled();
      fireEvent.load(reset); // the reset document
      message({ source: 'dp-mockup', type: 'picked', selector: PIN.selector, text: 'x' });
      expect(onPicked).toHaveBeenCalledTimes(1);
      expect(frameEl()).toBe(reset);
      expect(setSrc).not.toHaveBeenCalled();
      setSrc.mockRestore();
    });

    it('resets to the proposal URL in proposal mode', () => {
      render(<MockupFrame {...base} proposal={{ threadId: 't-ui-settings', optionId: 'days' }} />);
      const first = frameEl();
      fireEvent.load(first);
      fireEvent.load(first);
      expect(frameEl()).not.toBe(first);
      expect(frameEl().getAttribute('src')).toBe('/api/projects/acme-app/restock/threads/t-ui-settings/options/days/mockup/after');
    });

    it('counts loads afresh when the side or device changes', () => {
      const { rerender } = setup();
      fireEvent.load(frameEl());
      const setSrc = vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set');
      rerender(<MockupFrame {...base} pins={[PIN]} side="before" />);
      const before = frameEl();
      fireEvent.load(before); // the first load of the new document
      expect(frameEl()).toBe(before);
      expect(setSrc).not.toHaveBeenCalled();
      // A device change keeps the same document (only its width changes), so it doesn't reload and isn't a new count.
      rerender(<MockupFrame {...base} pins={[PIN]} side="before" device="mobile" />);
      expect(frameEl().getAttribute('width')).toBe('390');
      expect(frameEl()).toBe(before);
      setSrc.mockRestore();
    });

    it('loads a new element when the markup or the proposal changes, instead of reassigning src', () => {
      const setSrc = vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set');
      const { rerender } = render(<MockupFrame {...base} version="a1" />);
      const first = frameEl();
      fireEvent.load(first);
      rerender(<MockupFrame {...base} version="a1" />);
      expect(frameEl()).toBe(first);
      // The markup was redrawn: same URL, new document.
      rerender(<MockupFrame {...base} version="b2" />);
      const redrawn = frameEl();
      expect(redrawn).not.toBe(first);
      expect(redrawn.getAttribute('src')).toBe('/api/projects/acme-app/restock/items/ui-settings/mockup/after');
      // Its first load is its first, not a navigation.
      fireEvent.load(redrawn);
      expect(frameEl()).toBe(redrawn);
      // Switching proposed options is a new element too, so Back still leaves the page.
      rerender(<MockupFrame {...base} proposal={{ threadId: 't-ui-settings', optionId: 'days' }} version="t-ui-settings/days" />);
      const days = frameEl();
      rerender(<MockupFrame {...base} proposal={{ threadId: 't-ui-settings', optionId: 'weeks' }} version="t-ui-settings/weeks" />);
      expect(frameEl()).not.toBe(days);
      expect(frameEl().getAttribute('src')).toBe('/api/projects/acme-app/restock/threads/t-ui-settings/options/weeks/mockup/after');
      expect(setSrc).not.toHaveBeenCalled();
      setSrc.mockRestore();
    });

    it('puts back a frame that leaves before it has loaded', () => {
      setup();
      const first = frameEl();
      message({ source: 'dp-mockup', type: 'leaving' });
      expect(frameEl()).not.toBe(first);
    });

    it('forgets earlier resets once the frame has stayed put for 5 s', () => {
      vi.useFakeTimers();
      try {
        setup();
        const blanked = () => screen.queryByText("This mockup couldn't be shown.") !== null;
        fireEvent.load(frameEl());
        message({ source: 'dp-mockup', type: 'leaving' }); // 1
        fireEvent.load(frameEl());
        message({ source: 'dp-mockup', type: 'leaving' }); // 2
        fireEvent.load(frameEl());
        act(() => {
          vi.advanceTimersByTime(5_000);
        });
        message({ source: 'dp-mockup', type: 'leaving' }); // the third in a row, but after 5 s of calm the count started again
        expect(blanked()).toBe(false);
        fireEvent.load(frameEl());
        message({ source: 'dp-mockup', type: 'leaving' });
        fireEvent.load(frameEl());
        message({ source: 'dp-mockup', type: 'leaving' }); // three since the calm, with none between
        expect(blanked()).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('only counts calm time from a load, and only 5 s of it', () => {
      vi.useFakeTimers();
      try {
        setup();
        fireEvent.load(frameEl());
        message({ source: 'dp-mockup', type: 'leaving' }); // 1, and the reset document hasn't loaded
        act(() => {
          vi.advanceTimersByTime(10_000); // waiting for a load isn't calm
        });
        fireEvent.load(frameEl());
        act(() => {
          vi.advanceTimersByTime(4_000);
        });
        message({ source: 'dp-mockup', type: 'leaving' }); // 2: four seconds isn't long enough
        fireEvent.load(frameEl());
        message({ source: 'dp-mockup', type: 'leaving' }); // 3
        expect(screen.getByText("This mockup couldn't be shown.")).toBeTruthy();
      } finally {
        vi.useRealTimers();
      }
    });

    it('only accepts picks while pin mode is on', () => {
      const onPicked = vi.fn();
      const { rerender } = setup({ onPicked });
      fireEvent.load(frameEl());
      message({ source: 'dp-mockup', type: 'picked', selector: PIN.selector, text: 'x' });
      expect(onPicked).not.toHaveBeenCalled();
      rerender(<MockupFrame {...base} pins={[PIN]} onPicked={onPicked} pinMode />);
      message({ source: 'dp-mockup', type: 'picked', selector: PIN.selector, text: '<img src=x onerror=alert(1)>' });
      expect(onPicked).toHaveBeenCalledWith({ selector: PIN.selector, text: '<img src=x onerror=alert(1)>' });
    });

    it('opens only pins it sent, and reports only those as missing', () => {
      const onOpenPin = vi.fn();
      const onMissingPins = vi.fn();
      setup({ onOpenPin, onMissingPins });
      message({ source: 'dp-mockup', type: 'open-pin', id: PIN.id }); // before any pins were sent
      expect(onOpenPin).not.toHaveBeenCalled();
      fireEvent.load(frameEl());
      message({ source: 'dp-mockup', type: 'open-pin', id: 'ui-other' });
      expect(onOpenPin).not.toHaveBeenCalled();
      message({ source: 'dp-mockup', type: 'open-pin', id: PIN.id });
      expect(onOpenPin).toHaveBeenCalledWith(PIN.id);
      message({ source: 'dp-mockup', type: 'missing-pins', ids: [PIN.id, 'ui-other', 7] });
      expect(onMissingPins).toHaveBeenCalledWith([PIN.id]);
    });

    it('clamps the height to the device screen, and ignores heights that are not sane', () => {
      render(<MockupFrame {...base} />);
      const box = frameEl().parentElement!;
      message({ source: 'dp-mockup', type: 'size', height: 500 });
      message({ source: 'dp-mockup', type: 'size', height: Infinity });
      message({ source: 'dp-mockup', type: 'size', height: -5 });
      message({ source: 'dp-mockup', type: 'size', height: NaN });
      message({ source: 'dp-mockup', type: 'size', height: '900' });
      expect(box.style.height).toBe('500px');
      message({ source: 'dp-mockup', type: 'size', height: 1e9 });
      expect(box.style.height).toBe('800px');
    });

    it('treats a pagehide as a navigation, and gives up on a frame that keeps leaving', () => {
      const onPicked = vi.fn();
      setup({ pinMode: true, onPicked });
      const setSrc = vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set');
      const first = frameEl();
      fireEvent.load(first);
      message({ source: 'dp-mockup', type: 'leaving' });
      const second = frameEl();
      expect(second).not.toBe(first);
      message({ source: 'dp-mockup', type: 'picked', selector: PIN.selector, text: 'x' });
      expect(onPicked).not.toHaveBeenCalled();
      fireEvent.load(second);
      message({ source: 'dp-mockup', type: 'leaving' });
      const third = frameEl();
      expect(third).not.toBe(second);
      expect(setSrc).not.toHaveBeenCalled();
      fireEvent.load(third);
      expect(screen.queryByText("This mockup couldn't be shown.")).toBeNull();
      message({ source: 'dp-mockup', type: 'leaving' }); // the third in a row
      expect(screen.queryByTestId('mockup-frame')).toBeNull();
      expect(screen.getByText("This mockup couldn't be shown.")).toBeTruthy();
      setSrc.mockRestore();
    });

    it('blanks the frame after three navigations of any kind', () => {
      setup();
      fireEvent.load(frameEl());
      fireEvent.load(frameEl()); // 1
      fireEvent.load(frameEl());
      fireEvent.load(frameEl()); // 2
      expect(screen.getByTestId('mockup-frame')).toBeTruthy();
      fireEvent.load(frameEl());
      fireEvent.load(frameEl()); // 3
      expect(screen.queryByTestId('mockup-frame')).toBeNull();
    });

    it('cuts a pick down to a label and a selector', () => {
      const onPicked = vi.fn();
      setup({ pinMode: true, onPicked });
      fireEvent.load(frameEl());
      message({ source: 'dp-mockup', type: 'picked', selector: 's'.repeat(900), text: 't'.repeat(300) });
      expect(onPicked).toHaveBeenCalledWith({ selector: 's'.repeat(500), text: 't'.repeat(60) });
    });
  });
});
