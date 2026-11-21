"use client";

import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {request} from '../../lib/api';
import Icon from '../Icon';
import {addMapTiles} from '../../lib/mapTiles';

export default function LocationPicker({onConfirm, onClose}) {
  const dialog = useRef(null), canvas = useRef(null), map = useRef(null), marker = useRef(null);
  const tiles = useRef(null);
  const revision = useRef(0), pending = useRef(null), controller = useRef(null), chooseRef = useRef(null);
  const [query, setQuery] = useState(''), [results, setResults] = useState([]);
  const [point, setPoint] = useState(null), [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [mapError, setMapError] = useState('');
  const [ready, setReady] = useState(false);
  const [suggesting, setSuggesting] = useState(false), [activeIndex, setActiveIndex] = useState(-1);
  const searchInput = useRef(null);
  function invalidate() {
    clearTimeout(pending.current); controller.current?.abort(); setSuggesting(false); setActiveIndex(-1);
    controller.current = new AbortController();
    return ++revision.current;
  }
  function choose(lat, lon) {
    const ticket = invalidate();
    setPoint({lat, lon}); setSelected(null); setResults([]); setBusy(true); setError('');
    // Only user clicks/drag-end trigger lookups. Coalesce quick adjustments.
    pending.current = setTimeout(async () => {
      try {
        const result = await request(`places/reverse/?lat=${lat}&lon=${lon}`, {signal:controller.current.signal});
        if (ticket === revision.current) setSelected(result);
      } catch (issue) { if (ticket === revision.current) setError(issue.message); }
      finally { if (ticket === revision.current) setBusy(false); }
    }, 1200);
  }
  chooseRef.current = choose;
  useEffect(() => {
    let active = true;
    const previous = document.activeElement;
    dialog.current.showModal();
    import('leaflet').then(module => {
      if (!active) return;
      const L = module.default || module;
      const instance = L.map(canvas.current).setView([12.9716,77.5946],12);
      map.current = instance;
      tiles.current = addMapTiles(L, instance, message => { if (active) setMapError(message); });
      const pin = L.divIcon({className:'pickup-map-pin',html:'<span></span>',iconSize:[30,38],iconAnchor:[15,38]});
      marker.current = L.marker([12.9716,77.5946],{icon:pin,draggable:true,keyboard:true,title:'Selected location. Drag to adjust.'});
      marker.current.on('dragend', () => { const p = marker.current.getLatLng(); chooseRef.current(p.lat,p.lng); });
      instance.on('click', event => chooseRef.current(event.latlng.lat,event.latlng.lng));
      instance.invalidateSize(); setReady(true);
    }).catch(() => { if (active) setMapError('The map could not load. Search for an address instead.'); });
    return () => {
      active = false; revision.current++; clearTimeout(pending.current); controller.current?.abort();
      tiles.current?.dispose(); tiles.current = null;
      map.current?.remove(); map.current = null;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (!ready || !point || !map.current) return;
    marker.current.setLatLng([point.lat,point.lon]).addTo(map.current);
    map.current.setView([point.lat,point.lon],Math.max(16,map.current.getZoom()));
  }, [point,ready]);
  function changeQuery(value) {
    setQuery(value);
    const ticket = invalidate(); setResults([]); setError(''); setBusy(false);
    if (value.trim().length < 3) return;
    setSuggesting(true);
    pending.current = setTimeout(async () => {
      try {
        const rows = await request(`places/suggest/?q=${encodeURIComponent(value.trim())}`, {signal:controller.current.signal});
        if (ticket === revision.current) setResults(rows);
      } catch (issue) {
        if (ticket === revision.current) setError('Suggestions are unavailable. Press Search to find the full address.');
      } finally { if (ticket === revision.current) setSuggesting(false); }
    }, 550);
  }
  function selectResult(row) {
    invalidate(); setQuery(row.label || row.name); setPoint({lat:row.lat,lon:row.lon});
    setSelected(row); setResults([]); setBusy(false); setError('');
    // Fetch precise address fields only after an explicit selection.
    if (row.label) {
      const ticket = revision.current; setBusy(true);
      pending.current = setTimeout(async () => {
        try {
          const detail = await request(`places/reverse/?lat=${row.lat}&lon=${row.lon}`, {signal:controller.current.signal});
          if (ticket === revision.current) setSelected({...row, fields: {...row.fields, ...Object.fromEntries(Object.entries(detail.fields || {}).filter(([, value]) => value))}});
        } catch (issue) {
          if (ticket === revision.current) setError('Location selected. You can fill any missing address details below.');
        } finally { if (ticket === revision.current) setBusy(false); }
      }, 1200);
    }
  }
  function searchKeys(event) {
    if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setActiveIndex(index => (index + 1) % results.length); }
    if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setActiveIndex(index => (index - 1 + results.length) % results.length); }
    if (event.key === 'Enter' && activeIndex >= 0 && results[activeIndex]) { event.preventDefault(); selectResult(results[activeIndex]); }
    if (event.key === 'Escape' && (results.length || suggesting)) { event.preventDefault(); event.stopPropagation(); invalidate(); setResults([]); }
  }
  async function search(event) {
    event.preventDefault(); event.stopPropagation();
    if (query.trim().length < 3) {setError('Enter at least three characters to search.'); return;}
    const ticket = invalidate(); setBusy(true); setError(''); setResults([]); setSelected(null);
    try {
      const rows = await request(`places/search/?q=${encodeURIComponent(query.trim())}`, {signal:controller.current.signal});
      if (ticket !== revision.current) return;
      setResults(rows); if (!rows.length) setError('No places found. Try a nearby street, landmark or city.');
    } catch (issue) {if (ticket === revision.current) setError(issue.message);}
    finally {if (ticket === revision.current) setBusy(false);}
  }
  function locate() {
    if (!navigator.geolocation) {setError('Location is unavailable in this browser. Search for a place instead.'); return;}
    const ticket = invalidate(); setBusy(true); setError(''); setSelected(null);
    navigator.geolocation.getCurrentPosition(position => {
      if (ticket === revision.current) choose(position.coords.latitude,position.coords.longitude);
    }, issue => {
      if (ticket !== revision.current) return;
      setBusy(false); setError(issue.code === 1 ? 'Location access was denied. Search for your address instead.' : 'Could not find your location. Search for your address instead.');
    }, {enableHighAccuracy:true,timeout:10000,maximumAge:0});
  }
  const complete = Boolean(selected);
  function editLocation(key, value) {
    setSelected(old => ({...old, fields: {...old.fields, [key]: value}}));
  }
  return createPortal(<dialog ref={dialog} className="location-picker" onSubmit={event => { event.preventDefault(); event.stopPropagation(); }} aria-labelledby="pickup-map-title" onCancel={event => {event.preventDefault(); onClose();}}>
    <header className="location-picker-head"><span className="location-picker-symbol"><Icon name="pin" size={22}/></span><div><h2 id="pickup-map-title">Choose Location on Map</h2><p>Click the map or drag the pin to your address.</p></div><button type="button" className="location-picker-close" aria-label="Close location picker" onClick={onClose}><Icon name="close" size={20}/></button></header>
    <div className="location-picker-search-area"><form className="location-picker-search" onSubmit={search}><label><Icon name="search" size={16}/><input ref={searchInput} autoFocus type="search" role="combobox" aria-autocomplete="list" aria-controls="location-options" aria-expanded={results.length > 0} aria-activedescendant={activeIndex >= 0 ? `location-option-${activeIndex}` : undefined} onKeyDown={searchKeys} aria-label="Search address location" value={query} onChange={e=>changeQuery(e.target.value)} maxLength={120} placeholder="Search address, city, state or PIN code"/></label><button type="submit" disabled={busy}>Search</button><button type="button" onClick={locate} disabled={busy}><Icon name="pin" size={15}/>Use Current Location</button></form>
    {suggesting && <p className="location-suggest-loading" role="status">Finding locations...</p>}
    {!!results.length && <div id="location-options" className="location-picker-results" role="listbox" aria-label="Location suggestions">{results.map((row,index)=><button type="button" role="option" aria-selected={index === activeIndex} id={`location-option-${index}`} key={row.id} onMouseDown={event=>event.preventDefault()} onClick={()=>selectResult(row)}><Icon name="pin" size={17}/><span><strong>{row.label || row.name.split(',')[0]}</strong><small>{row.detail || row.name}</small></span></button>)}</div>}
    </div>
    {error && <p className="location-picker-message" role="alert">{error}</p>}
    {mapError && <p className="location-picker-message" role="status">{mapError} {tiles.current && <button type="button" onClick={() => tiles.current?.retry()}>Retry map</button>}</p>}
    <div className="location-picker-map-wrap"><div ref={canvas} className="location-picker-map" aria-label="Address location map" role="region"/><span className="location-picker-hint">Drag pin or click map to adjust</span></div>
    <footer className="location-picker-footer"><div className="location-picker-selection" aria-live="polite"><strong>Selected location</strong><p>{busy ? 'Finding location…' : selected?.name || 'Search or choose a point on the map.'}</p>{selected && <><div className="location-picker-fields">{[['address', 'Full address'], ['city', 'City'], ['state', 'State'], ['pincode', 'PIN code']].map(([key, label]) => <label className="field" key={key}><span>{label}</span><input aria-label={label} value={selected.fields?.[key] || ''} onChange={event => editLocation(key, event.target.value)} maxLength={key === 'pincode' ? 6 : key === 'address' ? 300 : 100} inputMode={key === 'pincode' ? 'numeric' : undefined} autoComplete={key === 'pincode' ? 'postal-code' : 'off'} disabled={busy}/></label>)}</div><small>Review the address details. You can complete missing fields here or in the form after confirming.</small></>}</div><div className="location-picker-actions"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="location-picker-confirm" disabled={!complete || busy} onClick={()=>onConfirm({address:selected.fields?.address || '',city:selected.fields?.city || '',state:selected.fields?.state || '',pincode:/^[1-9]\d{5}$/.test(selected.fields?.pincode) ? selected.fields.pincode : ''})}><Icon name="check" size={16}/>Confirm Location</button></div></footer>
    <p className="location-picker-privacy">Suggestions: Open-Meteo / GeoNames. Address search and map data: OpenStreetMap.</p>
  </dialog>, document.body);
}
