// Reset only homepage returns; leave intentional section links and other routes alone.
export function createHomeScrollController(view) {
  let previousPath = view.location.pathname;
  let returningByHistory = false;
  let frame = null;

  function cancelScroll() {
    if (frame !== null) view.cancelAnimationFrame(frame);
    frame = null;
  }

  function reset(ignoreHash = false) {
    cancelScroll();
    if (view.location.pathname !== "/" || (!ignoreHash && view.location.hash)) return;
    const hash = view.location.hash;
    const top = () => view.scrollTo({ top: 0, left: 0, behavior: "instant" });
    top();
    // Run once after the router and browser finish restoring the previous scroll.
    frame = view.requestAnimationFrame(() => {
      frame = null;
      if (view.location.pathname === "/" && view.location.hash === hash) top();
    });
  }

  function onHistoryNavigation() {
    returningByHistory = previousPath !== "/" && view.location.pathname === "/";
    if (returningByHistory) reset(true);
  }

  function onPageShow(event) {
    if (event.persisted) reset(true);
  }

  view.addEventListener("popstate", onHistoryNavigation);
  view.addEventListener("pageshow", onPageShow);

  return {
    routeChanged(pathname) {
      previousPath = pathname;
      reset(returningByHistory);
      returningByHistory = false;
    },
    dispose() {
      cancelScroll();
      view.removeEventListener("popstate", onHistoryNavigation);
      view.removeEventListener("pageshow", onPageShow);
    },
  };
}
