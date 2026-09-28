// Playback state is isolated so reduced-motion and visibility behavior can be verified.
export function setupTrailer(video, environment = window, documentRef = document) {
  if (!video) return;
  const preference = environment.matchMedia('(prefers-reduced-motion: reduce)');
  let attempted = false;
  let visible = false;
  let automatic = false;
  const maybePlay = () => {
    if (attempted || preference.matches || !visible || documentRef.hidden) return;
    attempted = true;
    automatic = true;
    video.muted = true;
    video.play().catch(() => { automatic = false; });
  };
  video.addEventListener('play', () => { attempted = true; });
  if ('IntersectionObserver' in environment) {
    const observer = new environment.IntersectionObserver(entries => {
      visible = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.5;
      maybePlay();
    }, {threshold: 0.5});
    observer.observe(video);
  }
  documentRef.addEventListener('visibilitychange', maybePlay);
  preference.addEventListener('change', () => {
    if (preference.matches && automatic) { video.pause(); automatic = false; }
    maybePlay();
  });
}
