// Share recovery behavior between address selection and nearby-service maps.
export function addMapTiles(L, map, onError) {
  const failed = new Set();
  let timer, retried = false, disposed = false;
  const layer = L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    referrerPolicy: 'strict-origin-when-cross-origin',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  function retry() {
    if (disposed) return;
    clearTimeout(timer); timer = undefined;
    failed.clear(); onError('');
    layer.redraw();
  }
  function recovered(event) {
    failed.delete(event.tile);
    if (!failed.size) { clearTimeout(timer); timer = undefined; onError(''); }
  }
  layer.on('tileerror', event => {
    failed.add(event.tile);
    onError('Some map tiles could not load. You can retry the map or search for an address.');
    if (!retried) {
      retried = true;
      timer = setTimeout(retry, 1500);
    }
  });
  layer.on('tileload', recovered);
  layer.on('tileunload', recovered);
  layer.addTo(map);
  return {
    retry,
    dispose() { disposed = true; clearTimeout(timer); layer.off(); },
  };
}
