// Fades sections in as they scroll into view. Skipped entirely for reduced-motion users
// (the CSS only hides [data-reveal] when motion is allowed).
const els = document.querySelectorAll<HTMLElement>('[data-reveal]');
if (els.length && matchMedia('(prefers-reduced-motion: no-preference)').matches) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  els.forEach((el) => io.observe(el));
}
