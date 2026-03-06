/**
 * Magnetic hover action — buttons subtly pull toward the cursor.
 * Usage: <button use:magnetic>...</button>
 * Or with options: <button use:magnetic={{ strength: 0.3 }}>...</button>
 */
export function magnetic(node: HTMLElement, opts?: { strength?: number }) {
	const strength = opts?.strength ?? 0.25;
	let animId: number;
	let bounds: DOMRect;

	// Skip on touch devices
	if (typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
		return { destroy() {} };
	}

	if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		return { destroy() {} };
	}

	function onEnter() {
		bounds = node.getBoundingClientRect();
	}

	function onMove(e: MouseEvent) {
		if (!bounds) bounds = node.getBoundingClientRect();
		const cx = bounds.left + bounds.width / 2;
		const cy = bounds.top + bounds.height / 2;
		const dx = (e.clientX - cx) * strength;
		const dy = (e.clientY - cy) * strength;
		cancelAnimationFrame(animId);
		animId = requestAnimationFrame(() => {
			node.style.transform = `translate(${dx}px, ${dy}px)`;
		});
	}

	function onLeave() {
		cancelAnimationFrame(animId);
		node.style.transform = '';
	}

	node.addEventListener('mouseenter', onEnter);
	node.addEventListener('mousemove', onMove);
	node.addEventListener('mouseleave', onLeave);

	return {
		destroy() {
			cancelAnimationFrame(animId);
			node.removeEventListener('mouseenter', onEnter);
			node.removeEventListener('mousemove', onMove);
			node.removeEventListener('mouseleave', onLeave);
			node.style.transform = '';
		}
	};
}
