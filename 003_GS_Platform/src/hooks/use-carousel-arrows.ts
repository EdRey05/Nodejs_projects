'use client';

import { useEffect } from 'react';
import type { CarouselApi } from '@/components/ui/carousel';

/** Keyboard arrow navigation for the viewer carousels (Phase 7):
 *  left/right arrows jump to previous/next entry when the focus is not in
 *  an input. Returns nothing; call with your existing api state. */
export function useCarouselArrows(api: CarouselApi | undefined, enabled = true) {
    useEffect(() => {
        if (!api || !enabled) return;
        function onKey(e: KeyboardEvent) {
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
            if (e.key === 'ArrowLeft') api?.scrollPrev();
            if (e.key === 'ArrowRight') api?.scrollNext();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [api, enabled]);
}